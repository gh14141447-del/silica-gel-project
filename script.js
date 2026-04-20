// script.js
const videoElement = document.getElementById("webcam");
const cursor = document.getElementById("finger-cursor");
const albumView = document.getElementById("albumView");
const detailView = document.getElementById("detailView");
const albumItems = document.querySelectorAll(".album-item");

let gestureRecognizer;
let lastVideoTime = -1;
let currentIndex = 0;
let isCooldown = false;
let prevHandX = 0;
let stopCounter = 0;

// 1. MediaPipe 초기 세팅
async function initGesture() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "libs/gesture_recognizer.task", // 경로가 정확한지 반드시 확인하세요!
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 1 // 한 손에 집중하여 성능 향상
  });

  console.log("✅ 제스처 및 클릭 시스템 준비 완료");
  startWebcam();
}

// 2. 웹캠 시작
async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 }
    });
    videoElement.srcObject = stream;
    videoElement.addEventListener("loadeddata", () => {
      predictWebcam();
    });
  } catch (err) {
    console.error("웹캠 접근 실패:", err);
    alert("웹캠을 찾을 수 없습니다.");
  }
}

// 3. 실시간 인식 및 조작 로직
async function predictWebcam() {
  if (videoElement.currentTime !== lastVideoTime) {
    lastVideoTime = videoElement.currentTime;
    const results = gestureRecognizer.recognizeForVideo(videoElement, Date.now());

    if (results.landmarks && results.landmarks.length > 0) {
      const lm = results.landmarks[0];
      const indexTip = lm[8];  // 검지 끝
      const thumbTip = lm[4];  // 엄지 끝
      const pinkyMCP = lm[17]; // 새끼손가락 마디 (손날 기준)

      // 화면 좌표 매핑 (좌우 반전 처리)
      const cx = (1 - indexTip.x) * window.innerWidth;
      const cy = indexTip.y * window.innerHeight;

      // 커서 이동
      if (cursor) {
        cursor.style.left = `${cx}px`;
        cursor.style.top = `${cy}px`;
      }

      const gesture = results.gestures[0] ? results.gestures[0][0].categoryName : "";
      const target = document.elementFromPoint(cx, cy);

      // --- [상황 1] 앨범 리스트가 열려 있을 때 (스와이프 + 상세 진입) ---
      if (albumView && albumView.classList.contains("open") && !detailView.classList.contains("active")) {
        const currentHandX = pinkyMCP.x;
        const velocity = currentHandX - prevHandX;

        // 1. 손날 스와이프 (왼쪽으로 쓸기)
        if (!isCooldown && velocity > 0.035) {
          currentIndex = (currentIndex + 1) % albumItems.length;
          if (window.updateCarousel) window.updateCarousel(); // HTML 내 정의된 함수 호출
          triggerCooldown(500);
        }

        // 2. 중앙 앨범 '주먹 쥐기'로 상세 페이지 진입
        const centerItem = document.querySelector(".album-item.center");
        if (centerItem) {
          const rect = centerItem.getBoundingClientRect();
          const isOver = cx > rect.left && cx < rect.right && cy > rect.top && cy < rect.bottom;

          if (isOver && Math.abs(velocity) < 0.01) {
            stopCounter++;
            if (stopCounter > 15) centerItem.classList.add("focused");
          } else {
            stopCounter = 0;
            centerItem.classList.remove("focused");
          }

          if (gesture === "Closed_Fist" && !isCooldown && centerItem.classList.contains("focused")) {
            const title = centerItem.getAttribute("data-title");
            const detailTitle = document.getElementById("detailTitle");
            if (detailTitle) detailTitle.textContent = title;
            detailView.classList.add("active");
            triggerCooldown(1200);
          }
        }
        prevHandX = currentHandX;

        // 앨범 뷰 내 닫기 버튼 상호작용
        handleButtonInteraction(target, indexTip, thumbTip);

      }
      // --- [상황 2] 메인 화면 혹은 상세 페이지 (클릭 위주) ---
      else {
        handleButtonInteraction(target, indexTip, thumbTip);
      }
    }
  }
  requestAnimationFrame(predictWebcam);
}

// 4. 전역 버튼 상호작용 (호버 자동 클릭 + 핀치 클릭)
function handleButtonInteraction(target, indexTip, thumbTip) {
  if (!target) return;

  // 버튼 혹은 카드 요소 찾기
  const btn = target.closest("button, .label-btn, #albumClose, #detailClose");

  if (btn) {
    btn.classList.add("btn-hovered");
    stopCounter++;

    // A. 호버 자동 클릭 (약 1.2초 대기 시)
    if (stopCounter > 35) {
      btn.click();
      stopCounter = 0;
      triggerCooldown(1000);
    }

    // B. 핀치(Pinch) 클릭 - 검지와 엄지 거리 측정 (Z축 포함 정밀 계산)
    const dist = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) +
      Math.pow(indexTip.y - thumbTip.y, 2) +
      Math.pow(indexTip.z - thumbTip.z, 2)
    );

    const PINCH_THRESHOLD = 0.06; // 감도 조절 (0.05~0.08 사이 추천)

    if (dist < PINCH_THRESHOLD && !isCooldown) {
      btn.click();
      triggerCooldown(1000);

      // 클릭 시각 피드백
      if (cursor) {
        cursor.style.transform = "scale(0.5)";
        setTimeout(() => { cursor.style.transform = "scale(1)"; }, 200);
      }
    }
  } else {
    stopCounter = 0;
    document.querySelectorAll(".btn-hovered").forEach(el => el.classList.remove("btn-hovered"));
  }
}

// 5. 쿨타임 제어
function triggerCooldown(ms) {
  isCooldown = true;
  setTimeout(() => { isCooldown = false; }, ms);
}

// 초기화 실행
import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
// 만약 모듈 방식이 아니라면 위 import를 지우고 HTML에서 script type="module"로 설정해야 합니다.
initGesture();