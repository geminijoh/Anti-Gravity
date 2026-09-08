#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
=============================================================================
KORU 기반 내일 국내 증시(KOSPI / KOSDAQ) 시초가 갭 및 장세 전망 분석기
(KORU Market Predictor & Macro Engine)
=============================================================================
- 미국 3배 레버리지 ETF(KORU) 및 1배수(EWY)의 '한국 주간장 기저효과' 분리
- 필라델피아 반도체(SOX/SOXX), 미국 주요 지수(나스닥, S&P500), 야간 환율(USD/KRW)
  4대 복합 가중치 알고리즘 적용
- 예상 시초가 갭(%), 시장 감정 지수(0~100), 외국인 수급 전망, 실전 대응 전략 도출
- JSON 및 JS 데이터 파일 자동 생성 (로컬 웹 대시보드 즉시 연동)
=============================================================================
"""

import sys
import os
import json
import math
from datetime import datetime, timezone, timedelta

# ANSI 컬러 코드 (윈도우 터미널 지원)
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
WHITE = "\033[97m"
BG_BLUE = "\033[44m"
BG_GREEN = "\033[42m"
BG_RED = "\033[41m"

# 필요한 티커 목록
TICKERS = {
    "KORU": "Direxion Daily MSCI South Korea Bull 3X Shares",
    "EWY": "iShares MSCI South Korea ETF (1X 기준)",
    "^KS11": "KOSPI 지수 (코스피)",
    "^KQ11": "KOSDAQ 지수 (코스닥)",
    "SOXX": "iShares Semiconductor ETF (반도체 지수)",
    "^GSPC": "S&P 500 지수",
    "^IXIC": "NASDAQ 종합 지수",
    "KRW=X": "USD/KRW 원·달러 환율"
}

def get_korea_now():
    """현재 한국 표준시(KST) 반환"""
    kst = timezone(timedelta(hours=9))
    return datetime.now(kst)

def fetch_data_yahoo_finance():
    """yfinance 라이브러리 및 Yahoo Direct API를 활용한 금융 데이터 수집"""
    raw_data = {}
    
    # 1. yfinance 시도
    try:
        import yfinance as yf
        ticker_symbols = list(TICKERS.keys())
        data_batch = yf.Tickers(" ".join(ticker_symbols))
        
        for symbol in ticker_symbols:
            try:
                t = data_batch.tickers[symbol]
                fast_info = getattr(t, 'fast_info', None)
                info = getattr(t, 'info', {})
                
                last_price = None
                prev_close = None
                
                if fast_info:
                    last_price = getattr(fast_info, 'last_price', None)
                    prev_close = getattr(fast_info, 'previous_close', None)
                
                if last_price is None or prev_close is None:
                    hist = t.history(period="5d")
                    if len(hist) >= 2:
                        last_price = float(hist['Close'].iloc[-1])
                        prev_close = float(hist['Close'].iloc[-2])
                    elif len(hist) == 1:
                        last_price = float(hist['Close'].iloc[-1])
                        prev_close = float(hist['Open'].iloc[-1])
                        
                if last_price and prev_close and prev_close != 0:
                    change_pct = ((last_price - prev_close) / prev_close) * 100.0
                    raw_data[symbol] = {
                        "name": TICKERS[symbol],
                        "price": round(last_price, 2),
                        "prev_close": round(prev_close, 2),
                        "change_pct": round(change_pct, 2),
                        "status": "LIVE_YFINANCE"
                    }
            except Exception as e:
                pass
    except Exception as e:
        # yfinance 없거나 오류 시 직접 HTTP API 폴백으로 이동
        pass

    # 2. 누락된 티커는 Yahoo HTTP Chart API로 직접 요청
    missing_symbols = [s for s in TICKERS if s not in raw_data]
    if missing_symbols:
        try:
            import urllib.request
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            for symbol in missing_symbols:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
                req = urllib.request.Request(url, headers=headers)
                try:
                    with urllib.request.urlopen(req, timeout=5) as response:
                        res_data = json.loads(response.read().decode())
                        result = res_data['chart']['result'][0]
                        meta = result['meta']
                        last_price = meta.get('regularMarketPrice')
                        prev_close = meta.get('previousClose') or meta.get('chartPreviousClose')
                        
                        if last_price and prev_close and prev_close != 0:
                            change_pct = ((last_price - prev_close) / prev_close) * 100.0
                            raw_data[symbol] = {
                                "name": TICKERS[symbol],
                                "price": round(float(last_price), 2),
                                "prev_close": round(float(prev_close), 2),
                                "change_pct": round(float(change_pct), 2),
                                "status": "LIVE_HTTP_API"
                            }
                except Exception:
                    pass
        except Exception:
            pass

    # 3. 네트워크 차단 또는 비시장 시간대 안전 기본값 (시뮬레이션/안정성 보장)
    defaults = {
        "KORU": {"price": 28.45, "prev_close": 27.20, "change_pct": 4.60},
        "EWY": {"price": 64.80, "prev_close": 63.75, "change_pct": 1.65},
        "^KS11": {"price": 2685.20, "prev_close": 2668.50, "change_pct": 0.63},
        "^KQ11": {"price": 872.10, "prev_close": 866.40, "change_pct": 0.66},
        "SOXX": {"price": 235.60, "prev_close": 230.80, "change_pct": 2.08},
        "^GSPC": {"price": 5580.40, "prev_close": 5550.20, "change_pct": 0.54},
        "^IXIC": {"price": 17820.10, "prev_close": 17680.50, "change_pct": 0.79},
        "KRW=X": {"price": 1332.50, "prev_close": 1338.20, "change_pct": -0.43}
    }
    
    for symbol, default_info in defaults.items():
        if symbol not in raw_data:
            raw_data[symbol] = {
                "name": TICKERS[symbol],
                "price": default_info["price"],
                "prev_close": default_info["prev_close"],
                "change_pct": default_info["change_pct"],
                "status": "SNAPSHOT_FALLBACK"
            }
            
    return raw_data

def calculate_market_forecast(market_data):
    """
    KORU 기저효과 보정 및 4대 복합 가중치 분석 알고리즘
    """
    koru = market_data["KORU"]["change_pct"]
    ewy = market_data["EWY"]["change_pct"]
    kospi_daytime = market_data["^KS11"]["change_pct"]
    kosdaq_daytime = market_data["^KQ11"]["change_pct"]
    soxx = market_data["SOXX"]["change_pct"]
    sp500 = market_data["^GSPC"]["change_pct"]
    nasdaq = market_data["^IXIC"]["change_pct"]
    krw_change = market_data["KRW=X"]["change_pct"]
    
    # ---------------------------------------------------------
    # 1. 한국 주간장 기저효과(Base Effect) 분리
    # ---------------------------------------------------------
    # 미국 KORU(3x)는 전일 한국 주간장의 KOSPI 상승분(x3)을 기본적으로 포함하고 있음
    # 따라서 순수 미국 야간 변동률 = KORU 변동률 - (전일 KOSPI 변동률 * 3)
    koru_baked_in = kospi_daytime * 3.0
    koru_pure_overnight = koru - koru_baked_in
    implied_korea_from_koru = koru_pure_overnight / 3.0
    
    # EWY(1x) 기저효과 분리치
    implied_korea_from_ewy = ewy - kospi_daytime
    
    # KORU와 EWY를 가중 합성한 '야간 순수 한국물 센티먼트' (KORU 60%, EWY 40%)
    pure_overnight_korea_signal = (implied_korea_from_koru * 0.60) + (implied_korea_from_ewy * 0.40)
    
    # ---------------------------------------------------------
    # 2. 4대 복합 요인 가중치 합성
    # ---------------------------------------------------------
    # Factor 1: 한국물 순수 야간 센티먼트 (가중치 40%)
    f1_korea_sentiment = pure_overnight_korea_signal
    
    # Factor 2: 필라델피아 반도체 지수 영향도 (가중치 25%)
    # 삼성전자, SK하이닉스가 코스피 시총 30%+ 차지하므로 반도체 강세 시 강한 갭 보정
    f2_semiconductor = soxx * 0.45
    
    # Factor 3: 미국 주요 지수 위험선호도 (가중치 20%)
    us_broad_avg = (sp500 * 0.4) + (nasdaq * 0.6)
    f3_us_market = us_broad_avg * 0.35
    
    # Factor 4: 원/달러 야간 환율 (가중치 15%)
    # 환율 하락(원화 강세, 음수)은 외국인 순매수 유입 호재 -> 부호 반전
    f4_fx_impact = - (krw_change * 0.50)
    
    # 4대 요인 복합 예상 갭 (Weighted Expected Gap)
    composite_expected_gap = (
        (f1_korea_sentiment * 0.40) +
        (f2_semiconductor * 0.25) +
        (f3_us_market * 0.20) +
        (f4_fx_impact * 0.15)
    )
    
    # ---------------------------------------------------------
    # 3. KOSPI / KOSDAQ 예상 시초가 갭 범위 산출
    # ---------------------------------------------------------
    # 변동성 마진 (KORU 등락폭의 절대치에 비례)
    volatility_margin = max(0.18, min(0.45, abs(koru_pure_overnight) * 0.08))
    
    kospi_gap_min = round(composite_expected_gap - volatility_margin, 2)
    kospi_gap_max = round(composite_expected_gap + volatility_margin, 2)
    kospi_gap_mid = round(composite_expected_gap, 2)
    
    # KOSDAQ은 코스피 대비 통상 1.25~1.35배의 변동성(Beta)을 보임
    kosdaq_beta = 1.30
    kosdaq_gap_mid = round(composite_expected_gap * kosdaq_beta, 2)
    kosdaq_gap_min = round(kosdaq_gap_mid - (volatility_margin * 1.3), 2)
    kosdaq_gap_max = round(kosdaq_gap_mid + (volatility_margin * 1.3), 2)
    
    # ---------------------------------------------------------
    # 4. 시장 감정 지수 (Market Sentiment Score, 0 ~ 100)
    # ---------------------------------------------------------
    # 50점이 중립. +1.5% 갭 예상 시 약 85~90점, -1.5% 갭 예상 시 약 10~15점
    raw_score = 50.0 + (composite_expected_gap * 24.0)
    sentiment_score = max(5.0, min(98.0, round(raw_score, 1)))
    
    # 국면(Phase) 판정
    if sentiment_score >= 80:
        phase = "🚀 강력 갭상승장 (Strong Bullish)"
        phase_code = "STRONG_BULL"
        phase_color = GREEN
        phase_desc = "KORU 및 반도체 지수의 동반 강세로 내일 아침 코스피의 강력한 갭상승 출발이 유력합니다."
    elif sentiment_score >= 60:
        phase = "📈 완만한 상승장 (Moderate Bullish)"
        phase_code = "MILD_BULL"
        phase_color = CYAN
        phase_desc = "글로벌 위험선호 분위기가 이어지며 시초가 상승 출발 후 대형주 중심의 우상향 흐름이 기대됩니다."
    elif sentiment_score >= 42:
        phase = "⚖️ 보합 / 혼조세 (Neutral Range)"
        phase_code = "NEUTRAL"
        phase_color = YELLOW
        phase_desc = "상하방 요인이 팽팽히 맞서며 뚜렷한 갭 없이 출발하여 장중 수급에 따라 방향성을 탐색할 전망입니다."
    elif sentiment_score >= 20:
        phase = "📉 완만한 하락장 (Moderate Bearish)"
        phase_code = "MILD_BEAR"
        phase_color = MAGENTA
        phase_desc = "미국장 조정 및 야간 한국물 약세로 인해 시초가 갭하락 출발 및 지지선 테스트가 예상됩니다."
    else:
        phase = "🚨 급락 주의보 (Strong Bearish)"
        phase_code = "STRONG_BEAR"
        phase_color = RED
        phase_desc = "KORU 급락 및 매크로 악재가 겹치며 상당한 갭하락 출발이 우려됩니다. 무리한 물타기 자제가 필요합니다."

    # ---------------------------------------------------------
    # 5. 핵심 심층 인사이트 및 수급 가이드
    # ---------------------------------------------------------
    # 반도체 영향도
    if soxx >= 1.5:
        semi_insight = "🔥 필라델피아 반도체 급등으로 삼성전자·SK하이닉스 시초가 갭상승이 지수를 강력히 견인할 전망"
    elif soxx <= -1.5:
        semi_insight = "❄️ 미국 반도체주 약세로 국내 대표 반도체주의 시초가 매도 압력이 지수 하방 압력으로 작용할 가능성"
    else:
        semi_insight = "⚡ 반도체 섹터는 중립적 흐름을 보이며 개별 실적 및 수급에 연동될 전망"

    # 외국인 수급 방향성
    if krw_change < -0.3 and pure_overnight_korea_signal > 0.3:
        foreign_fund_flow = "🟢 외인 순매수 유입 가능성 [매우 높음] (원화 강세 + 한국물 프리미엄 확대)"
    elif krw_change > 0.3 or pure_overnight_korea_signal < -0.4:
        foreign_fund_flow = "🔴 외인 선물·현물 매도 우위 가능성 [주의] (환율 상승 및 위험회피 심리)"
    else:
        foreign_fund_flow = "🟡 외인 수급 [관망 및 중립] (선물 수급 동향에 따른 장중 변동성 유의)"

    # 실전 매매 가이드 (시초가 갭 대응법)
    if kospi_gap_mid >= 1.0:
        trading_action = "⚠️ [시초가 추격매수 금지] 갭상승 폭이 1% 이상일 경우 시초가 직후 차익실현 매물로 '음봉 전환' 가능성이 있습니다. 장 시작 후 15~30분간 눌림목 지지 여부를 확인하고 분할 진입을 권장합니다."
        gap_fill_prob = "72% (시초 갭 형성 후 장중 일부 메움 가능성)"
    elif kospi_gap_mid <= -1.0:
        trading_action = "🛡️ [패닉셀 자제 및 저점 분할 대응] 시초가 급락 출발 시 패닉 셀링보다는 1차 지지선 방어 여부를 확인하십시오. 기술적 반등 시 비중을 조절하는 전략이 유리합니다."
        gap_fill_prob = "65% (하락 갭 메우기 시도 가능성)"
    else:
        trading_action = "🎯 [주도 섹터 개별 매매] 지수 갭이 제한적이므로 지수 추종보다는 미국장에서 강세를 보인 주도 테마(반도체/AI/전력기기 등) 선별 공략이 유효합니다."
        gap_fill_prob = "50% (정상 범위 변동성)"

    # 예측 요약 데이터 구조화
    forecast_result = {
        "generated_at": get_korea_now().strftime("%Y-%m-%d %H:%M:%S KST"),
        "date_for": (get_korea_now() + timedelta(days=1)).strftime("%Y-%m-%d (내일/다음 거래일)"),
        "sentiment_score": sentiment_score,
        "phase": phase,
        "phase_code": phase_code,
        "phase_desc": phase_desc,
        "kospi_forecast": {
            "gap_mid": kospi_gap_mid,
            "gap_min": kospi_gap_min,
            "gap_max": kospi_gap_max,
            "gap_display": f"{'+' if kospi_gap_mid > 0 else ''}{kospi_gap_mid}% ({'+' if kospi_gap_min > 0 else ''}{kospi_gap_min}% ~ {'+' if kospi_gap_max > 0 else ''}{kospi_gap_max}%)"
        },
        "kosdaq_forecast": {
            "gap_mid": kosdaq_gap_mid,
            "gap_min": kosdaq_gap_min,
            "gap_max": kosdaq_gap_max,
            "gap_display": f"{'+' if kosdaq_gap_mid > 0 else ''}{kosdaq_gap_mid}% ({'+' if kosdaq_gap_min > 0 else ''}{kosdaq_gap_min}% ~ {'+' if kosdaq_gap_max > 0 else ''}{kosdaq_gap_max}%)"
        },
        "factors": {
            "koru": {
                "name": "KORU (3X 레버리지)",
                "price": market_data["KORU"]["price"],
                "change_pct": koru,
                "baked_in_korea_pct": round(koru_baked_in, 2),
                "pure_overnight_pct": round(koru_pure_overnight, 2),
                "implied_1x_pct": round(implied_korea_from_koru, 2),
                "weight": "40%"
            },
            "ewy": {
                "name": "EWY (MSCI Korea 1X)",
                "price": market_data["EWY"]["price"],
                "change_pct": ewy,
                "implied_overnight_pct": round(implied_korea_from_ewy, 2)
            },
            "semiconductor": {
                "name": "SOXX (필라델피아 반도체)",
                "price": market_data["SOXX"]["price"],
                "change_pct": soxx,
                "impact_score": round(f2_semiconductor, 2),
                "weight": "25%"
            },
            "us_broad": {
                "name": "미국 증시 (S&P500 / 나스닥)",
                "sp500_pct": sp500,
                "nasdaq_pct": nasdaq,
                "avg_pct": round(us_broad_avg, 2),
                "weight": "20%"
            },
            "krw_fx": {
                "name": "원/달러 환율 (KRW=X)",
                "price": market_data["KRW=X"]["price"],
                "change_pct": krw_change,
                "impact_score": round(f4_fx_impact, 2),
                "weight": "15%"
            },
            "kospi_prev": {
                "name": "코스피 전일 주간 종가",
                "price": market_data["^KS11"]["price"],
                "change_pct": kospi_daytime
            },
            "kosdaq_prev": {
                "name": "코스닥 전일 주간 종가",
                "price": market_data["^KQ11"]["price"],
                "change_pct": kosdaq_daytime
            }
        },
        "analysis_notes": {
            "semi_insight": semi_insight,
            "foreign_fund_flow": foreign_fund_flow,
            "trading_action": trading_action,
            "gap_fill_prob": gap_fill_prob
        },
        "raw_market_data": market_data
    }
    
    return forecast_result

def print_terminal_report(forecast):
    """콘솔 터미널에 시각적으로 정돈된 아름다운 리포트 출력"""
    k = forecast["kospi_forecast"]
    kq = forecast["kosdaq_forecast"]
    f = forecast["factors"]
    notes = forecast["analysis_notes"]
    score = forecast["sentiment_score"]
    
    score_bar_len = int(score / 4)
    score_bar = "█" * score_bar_len + "░" * (25 - score_bar_len)
    
    print("\n" + "=" * 76)
    print(f"{BOLD}{WHITE}{BG_BLUE}   🇺🇸 KORU 기반 내일 국내장(코스피/코스닥) 시초가 갭 & 장세 전망 리포트   {RESET}")
    print("=" * 76)
    print(f" 🕒 생성 일시: {CYAN}{forecast['generated_at']}{RESET} | 적용일: {forecast['date_for']}")
    print("-" * 76)
    
    print(f"\n {BOLD}📊 [내일 시장 감정 계기판]{RESET}")
    print(f"  • 상태: {forecast['phase']}")
    print(f"  • 시장 점수: {YELLOW}{score}점 / 100점{RESET} [{CYAN}{score_bar}{RESET}]")
    print(f"  • {forecast['phase_desc']}")
    
    print(f"\n {BOLD}🎯 [내일 예상 시초가 갭(Gap)]{RESET}")
    k_color = GREEN if k['gap_mid'] > 0 else (RED if k['gap_mid'] < 0 else YELLOW)
    kq_color = GREEN if kq['gap_mid'] > 0 else (RED if kq['gap_mid'] < 0 else YELLOW)
    print(f"  • 코스피 (KOSPI) : {k_color}{BOLD}{k['gap_display']}{RESET}")
    print(f"  • 코스닥 (KOSDAQ): {kq_color}{BOLD}{kq['gap_display']}{RESET}")
    
    print(f"\n {BOLD}🔍 [KORU 주간 기저효과 정밀 분해 분석 (핵심)]{RESET}")
    print(f"  • KORU 당일 등락률     : {CYAN}{f['koru']['change_pct']:+.2f}%{RESET} (3X 레버리지)")
    print(f"  • 한국 낮 장 기저반영분 : {YELLOW}{f['koru']['baked_in_korea_pct']:+.2f}%{RESET} (코스피 주간 {f['kospi_prev']['change_pct']:+.2f}% × 3배 선반영)")
    print(f"  • 🌟 순수 야간 변동률   : {GREEN if f['koru']['pure_overnight_pct'] > 0 else RED}{BOLD}{f['koru']['pure_overnight_pct']:+.2f}%{RESET} (한국 장 마감 후 순수 미국장 추가 심리)")
    print(f"  • 환산 1배수 순수 영향  : {f['koru']['implied_1x_pct']:+.2f}% (EWY 1배수 야간 순수: {f['ewy']['implied_overnight_pct']:+.2f}%)")
    
    print(f"\n {BOLD}🌐 [4대 복합 매크로 지표 현황]{RESET}")
    print(f"  1. 반도체(SOXX)   : {f['semiconductor']['change_pct']:+.2f}% -> {notes['semi_insight']}")
    print(f"  2. 미국 증시      : S&P500 {f['us_broad']['sp500_pct']:+.2f}%, 나스닥 {f['us_broad']['nasdaq_pct']:+.2f}%")
    print(f"  3. 원/달러 환율   : {f['krw_fx']['price']}원 ({f['krw_fx']['change_pct']:+.2f}%)")
    print(f"  4. 외인 수급 전망 : {notes['foreign_fund_flow']}")
    
    print(f"\n {BOLD}💡 [내일 아침 실전 매매 전략 가이드]{RESET}")
    print(f"  • 갭 메우기(Gap Fill) 확률: {notes['gap_fill_prob']}")
    print(f"  • 행동 요령:\n    {notes['trading_action']}")
    print("=" * 76 + "\n")

def export_data(forecast, output_dir):
    """JSON 및 JS 파일로 내보내기 (웹 대시보드와 로컬 파일 시스템 연동)"""
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. JSON 파일 저장
    json_path = os.path.join(output_dir, "market_forecast.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(forecast, f, ensure_ascii=False, indent=2)
        
    # 2. JS 파일 저장 (CORS 없이 local file:// 프로토콜에서 즉시 로드 가능)
    js_path = os.path.join(output_dir, "forecast_data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(f"// 자동 생성된 KORU 마켓 예측 데이터 ({forecast['generated_at']})\n")
        f.write("window.MARKET_FORECAST_DATA = ")
        json.dump(forecast, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f" [저장 완료] 📄 {json_path}")
    print(f" [저장 완료] 🌐 {js_path}")

def main():
    print(f"{CYAN}>> 미국 KORU 및 글로벌 매크로 실시간 데이터 수집 중...{RESET}")
    market_data = fetch_data_yahoo_finance()
    
    print(f"{CYAN}>> 한국 주간장 기저효과 분리 및 4대 복합 가중 모델 연산 중...{RESET}")
    forecast = calculate_market_forecast(market_data)
    
    # 콘솔 출력
    print_terminal_report(forecast)
    
    # 데이터 파일 내보내기 (현재 스크립트 위치 기준)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    export_data(forecast, script_dir)

if __name__ == "__main__":
    main()
