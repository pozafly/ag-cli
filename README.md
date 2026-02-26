# ag-cli (Antigravity-style CLI)

Node.js + TypeScript 기반 에이전트/오케스트레이터 CLI.

## 핵심 기능
- Codex 계열 모델 기반 **Task Group planning**
- 승인 게이트(위험 키워드 탐지, `--approve-risky` 우회)
- 병렬 워커풀 실행(`worker.poolSize`)
- 브라우저 서브에이전트(Playwright) 리서치
- 에이전트 매니저 v1(다중 에이전트 핵심 루프, 역할 프로필+LLM 라우팅, 실행 이력)
- 실행 결과/리뷰 아티팩트 + 크로스서피스 검증 훅 자동 생성

## 설치 및 실행
```bash
cd ag-cli
npm install
npx playwright install chromium

# 개발 실행
npm run dev -- --help

# 빌드
npm run build

# 전역 커맨드로 연결
npm link
```

## 명령어
```bash
ag init
ag run "Build a project scaffold for ..."
ag run "Refactor and delete legacy DB rows" --execute
ag run "Refactor and delete legacy DB rows" --execute --approve-risky
ag browser "https://antigravity.google/"
ag delegate --worker codex --prompt "이 저장소의 다음 할 일 요약해줘"

# 에이전트 매니저 v1
ag manager init
ag manager status
ag manager assign "안티그래비티 스타일 오케스트레이션 v1 착수"
ag manager run "다중 에이전트 배정 후 실행까지 진행" --approve-risky
```

## 설정 (`ag.config.yaml`)
`ag init`으로 기본 설정을 생성합니다.

중요 키:
- `worker.poolSize`: Task Group 병렬 실행 개수
- `worker.timeoutMs`: 워커 타임아웃
- `approval.enabled`, `approval.riskyKeywords`: 승인 게이트 정책
- `review.testCommand`, `review.maxDiffChars`: 리뷰 아티팩트 생성 정책
- `browser.headless`, `browser.slowMoMs`: 브라우저 실행 옵션

## 아티팩트 흐름
- 에이전트 매니저 상태: `artifacts/agent-manager-v1.json`
- 플랜 저장: `artifacts/run-<session>-plan.json`, `artifacts/run-<session>-manager-plan.json`
- 실행 저장: `artifacts/run-<session>-exec.json`, `artifacts/run-<session>-manager-exec.json`
- 워커/브라우저 결과: `artifacts/worker-*.json`, `artifacts/browser-research-*.json`
- 리뷰 보고서: `artifacts/review-<session>.md`
- 크로스서피스 검증 훅: `artifacts/cross-surface-<session>.md`

리뷰 아티팩트에는 아래가 포함됩니다.
- Task 실행 요약
- `git status --short`
- 테스트 커맨드 결과
- diff 일부(최대 `review.maxDiffChars`)

## 개발 메모
- 소스는 `src/*.ts`
- 배포 엔트리는 `dist/cli.js`
- 타입 정의는 `src/types.ts`에서 중앙 관리
