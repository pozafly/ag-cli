# ag-cli (Antigravity-style CLI)

Node.js 기반 에이전트/오케스트레이터 CLI MVP.

## 목표
- Codex 계열 모델로 **task-group planning + 실행 오케스트레이션**
- 브라우저 서브에이전트(Playwright) 연동
- 아티팩트 저장(run state / browser research)

## 빠른 시작
```bash
cd ag-cli
npm install
npx playwright install chromium

# 전역 커맨드로 쓰고 싶으면
npm link

ag init
export OPENAI_API_KEY=...
ag run "Build a project scaffold for ..."
ag browser "https://antigravity.google/"
```

## 명령어
- `ag init` : 기본 `ag.config.yaml` 생성
- `ag run "<objective>"` : 오케스트레이터 플래너 실행
- `ag browser <url>` : 브라우저 서브에이전트 리서치 실행

## 현재 상태 (MVP)
- [x] 모델 호출
- [x] Task Group 초안 생성
- [x] Browser subagent data capture
- [x] Artifact 저장
- [ ] 멀티 에이전트 병렬 실행
- [ ] 승인가드(Request Review)
- [ ] 터미널 액션 플래닝/실행 루프
- [ ] 장기 메모리/지식아이템 누적

## 다음 단계 (v1)
1. Task Group 실행기(worker pool)
2. 위험 액션 승인 게이트
3. 변경점 리뷰 뷰(diff + test + evidence)
4. 모델 라우팅 전략(quality/fast/fallback)
