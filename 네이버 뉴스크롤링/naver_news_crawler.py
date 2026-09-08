import csv
import os
import sys
import time
from datetime import datetime
from urllib.parse import urljoin

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.edge.options import Options as EdgeOptions
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import (
        TimeoutException,
        NoSuchElementException,
        ElementClickInterceptedException,
    )
except ImportError:
    print("\n[오류] selenium 패키지가 설치되어 있지 않습니다.")
    print("다음 명령어를 실행하여 설치해주세요:")
    print("pip install -r requirements.txt\n")
    sys.exit(1)


def get_user_options():
    """사용자로부터 실행 옵션(헤드리스 모드, 수집 페이지 수)을 입력받습니다."""
    print("=" * 60)
    print("         네이버 뉴스 사회 섹션(102) 기사 크롤러")
    print("=" * 60)

    # 1. 헤드리스 모드 선택
    while True:
        choice = input("1. 헤드리스(Headless) 모드로 실행하시겠습니까? (브라우저 창 숨김) [y/n] (기본값: y): ").strip().lower()
        if choice in ("", "y", "yes"):
            headless = True
            print("   -> 헤드리스 모드(창 숨김)로 실행합니다.\n")
            break
        elif choice in ("n", "no"):
            headless = False
            print("   -> 브라우저 창을 띄우고 실행합니다.\n")
            break
        else:
            print("   'y' 또는 'n'을 입력해주세요.")

    # 2. 수집할 페이지 수 입력
    while True:
        page_input = input("2. 수집할 페이지 수를 입력하세요 (1페이지=기본화면, 2 이상 입력 시 더보기 클릭) [기본값: 1]: ").strip()
        if page_input == "":
            pages = 1
            print("   -> 기본 1페이지만 수집합니다.\n")
            break
        elif page_input.isdigit() and int(page_input) >= 1:
            pages = int(page_input)
            print(f"   -> 총 {pages}페이지(더보기 {pages - 1}회 클릭) 분량을 수집합니다.\n")
            break
        else:
            print("   1 이상의 정수를 입력해주세요.")

    return headless, pages


def create_driver(headless=True):
    """크롬 또는 엣지 웹드라이버를 생성합니다."""
    # 1. Chrome 시도
    try:
        chrome_options = ChromeOptions()
        if headless:
            chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as chrome_err:
        print(f"[알림] Chrome 실행 실패 ({chrome_err}), Edge 브라우저로 재시도합니다...")

    # 2. Edge 시도
    try:
        edge_options = EdgeOptions()
        if headless:
            edge_options.add_argument("--headless=new")
        edge_options.add_argument("--disable-gpu")
        edge_options.add_argument("--no-sandbox")
        edge_options.add_argument("--disable-dev-shm-usage")
        edge_options.add_argument("--window-size=1920,1080")
        edge_options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        driver = webdriver.Edge(options=edge_options)
        return driver
    except Exception as edge_err:
        print(f"\n[오류] 브라우저 드라이버를 실행할 수 없습니다: {edge_err}")
        sys.exit(1)


def click_more_button(driver, target_clicks):
    """지정된 횟수만큼 '더보기' 버튼을 클릭합니다."""
    if target_clicks <= 0:
        return

    print(f"[*] '더보기' 버튼 클릭을 시작합니다. (총 {target_clicks}회 시도)")

    for click_idx in range(1, target_clicks + 1):
        try:
            # 더보기 버튼 컨테이너: class="section_more _SECTION_HEADLINE_MORE_BUTTON_WRAP"
            # 내부의 a 태그 또는 버튼 검색
            more_wrap_selector = "._SECTION_HEADLINE_MORE_BUTTON_WRAP"
            
            # 요소가 나타날 때까지 최대 5초 대기
            WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, more_wrap_selector))
            )

            # 더보기 컨테이너 내의 a 태그 또는 버튼 찾기
            more_btn = None
            for selector in [
                f"{more_wrap_selector} a",
                f"{more_wrap_selector} button",
                more_wrap_selector
            ]:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if elements and elements[0].is_displayed():
                    more_btn = elements[0]
                    break

            if not more_btn:
                print(f"   [!] 더보기 버튼을 더 이상 찾을 수 없습니다. (클릭 중단: {click_idx - 1}/{target_clicks})")
                break

            # 버튼 위치로 스크롤 이동
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", more_btn)
            time.sleep(0.5)

            # 클릭 시도 (일반 클릭 또는 JavaScript 클릭)
            try:
                more_btn.click()
            except ElementClickInterceptedException:
                driver.execute_script("arguments[0].click();", more_btn)

            print(f"   - 더보기 클릭 완료 ({click_idx}/{target_clicks})")
            
            # 동적 컨텐츠 로딩 대기
            time.sleep(1.5)

        except (TimeoutException, NoSuchElementException):
            print(f"   [!] 더보기 버튼이 더 이상 존재하지 않습니다. ({click_idx - 1}회 클릭 후 종료)")
            break
        except Exception as e:
            print(f"   [!] 더보기 클릭 중 예외 발생: {e}")
            break


def scrape_articles(driver):
    """현재 로드된 페이지에서 기사 제목과 링크를 추출합니다."""
    print("\n[*] 기사 목록 수집 및 파싱을 시작합니다...")
    
    # 1. 제목 클래스: sa_text_strong
    title_elements = driver.find_elements(By.CSS_SELECTOR, ".sa_text_strong")
    print(f"[*] 검색된 제목 요소 수: {len(title_elements)}개")

    articles = []
    seen_links = set()
    base_url = "https://news.naver.com"

    for elem in title_elements:
        try:
            # 기사 제목 텍스트 추출
            title = elem.text.strip()
            if not title:
                title = elem.get_attribute("textContent").strip()
            
            if not title:
                continue

            # 기사 원문 링크 추출
            link = ""
            # 상위 a 태그 탐색 (제목을 감싸고 있는 링크)
            try:
                parent_a = elem.find_element(By.XPATH, "./ancestor::a[1]")
                link = parent_a.get_attribute("href") or ""
            except NoSuchElementException:
                pass

            # 상위 a 태그에서 못 찾은 경우 주변의 기사 링크 탐색
            if not link:
                try:
                    # 상위 li 또는 컨테이너에서 a 태그 탐색
                    container = elem.find_element(By.XPATH, "./ancestor::li[1]")
                    a_tag = container.find_element(By.CSS_SELECTOR, "a[href*='/article/']")
                    link = a_tag.get_attribute("href") or ""
                except NoSuchElementException:
                    pass

            # 상대 경로인 경우 절대 경로로 변환
            if link and not link.startswith("http"):
                link = urljoin(base_url, link)

            # 유효한 기사 링크이고 중복이 아닌 경우 저장
            if link and link not in seen_links:
                seen_links.add(link)
                articles.append({
                    "제목": title,
                    "원문 링크": link
                })

        except Exception as parse_err:
            continue

    return articles


def save_to_csv(articles, output_filename=None):
    """추출된 기사 목록을 CSV 파일로 저장합니다."""
    if not output_filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"naver_news_102_{timestamp}.csv"

    # Excel에서 한글이 깨지지 않도록 utf-8-sig 인코딩 사용
    with open(output_filename, mode="w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        # 헤더 작성
        writer.writerow(["기사 제목", "원문 링크"])
        
        # 데이터 작성
        for item in articles:
            writer.writerow([item["제목"], item["원문 링크"]])

    return output_filename


def main():
    # 1. 사용자 옵션 입력
    headless, pages = get_user_options()

    target_url = "https://news.naver.com/section/102"
    print(f"[*] 대상 URL 접속 중: {target_url}")

    driver = create_driver(headless=headless)

    try:
        driver.get(target_url)

        # 페이지 초기 로드 대기 (최대 10초)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".sa_text_strong"))
        )
        time.sleep(1)

        # 2. 페이지 수에 따른 '더보기' 클릭 수행 (pages - 1 회 클릭)
        target_clicks = pages - 1
        if target_clicks > 0:
            click_more_button(driver, target_clicks)

        # 3. 기사 수집
        articles = scrape_articles(driver)
        print(f"[+] 총 {len(articles)}개의 기사를 수집하였습니다.")

        if not articles:
            print("[!] 수집된 기사가 없습니다.")
            return

        # 4. CSV 파일 저장
        output_path = save_to_csv(articles)
        abs_path = os.path.abspath(output_path)
        print(f"\n[성공] CSV 파일 저장이 완료되었습니다!")
        print(f"   - 저장 파일명: {output_path}")
        print(f"   - 전체 파일 경로: {abs_path}")
        print(f"   - 수집 기사 수: {len(articles)}개")

        # 상위 3개 샘플 미리보기 출력
        print("\n[*] 수집 데이터 샘플 (상위 3건):")
        for i, item in enumerate(articles[:3], 1):
            print(f"  [{i}] {item['제목']}")
            print(f"      링크: {item['원문 링크']}")

    except Exception as e:
        print(f"\n[오류 발생] 크롤링 중 오류가 발생했습니다: {e}")
    finally:
        driver.quit()
        print("\n[*] 브라우저 드라이버를 종료했습니다.")


if __name__ == "__main__":
    main()
