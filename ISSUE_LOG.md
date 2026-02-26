# 이슈 로그 (코멘트 기록)

## 이슈: 에이전트 매니저 v1
- 상태: 완료(마무리 반영)
- 코멘트:
  - 역할 프로필(planner/executor/reviewer/researcher) 기본 세트를 도입했습니다.
  - 키워드 + 우선순위 점수 기반 라우팅으로 Task Group별 워커 할당이 가능해졌습니다.
  - `artifacts/agent-manager-v1.json` 파일에 프로필/실행 이력을 누적 저장합니다.
  - `ag manager assign`은 플래닝 후 라우팅 결과를 출력하고 manager-plan 아티팩트를 남깁니다.
  - `ag manager run` 결과에 worker 집계 + role 집계를 모두 출력하도록 확장했습니다.
  - 실행 결과 JSON(`latestOutput`)에도 `byWorker`, `byRole` 집계를 동시에 남겨 후처리 파이프라인에서 바로 소비할 수 있습니다.

## 이슈: LLM 역할 라우팅 안정화
- 상태: 완료
- 코멘트:
  - 라우팅 프롬프트에 `role=<역할명>` 출력 형식을 강제했습니다.
  - 응답 파서를 분리해 `role=` 1순위, 전체 텍스트 포함 매칭 2순위로 안정화했습니다.
  - 1회성 실패/잡음 대응을 위해 동일 프롬프트 재시도(최대 2회)를 추가했습니다.
  - LLM SDK 호출에 timeout/retry 제한을 걸고, `output_text` 비어 있을 때 message content fallback 파싱을 추가했습니다.

## 이슈: 워커 재시도 신뢰성 강화
- 상태: 완료
- 코멘트:
  - `runWorkerTaskWithRetry`를 추가해 실패/타임아웃 시 설정 기반 재시도(백오프 포함)를 지원합니다.
  - `orchestrator`와 `agent-manager` 실행 루프가 재시도 API를 사용하도록 교체했습니다.
  - worker result payload에 `attempts`를 포함해 후처리/품질분석에 활용 가능하게 했습니다.
  - manager 집계에 worker/role 단위 `retries`를 추가해 품질 지표를 출력합니다.

## 이슈: 크로스서피스 검증 훅 완성
- 상태: 완료
- 코멘트:
  - `git rev-parse --show-toplevel`로 저장소 루트를 자동 감지해 실행 위치에 덜 민감해졌습니다.
  - Worker/Browser 표면에 대해 assignee-result 불일치 개수를 검증 항목으로 추가했습니다.
  - 테스트/실패/보류/불일치 통합 조건으로 `passed` 판정을 생성해 훅 요약에 반영했습니다.

## 이슈: 30분 백그라운드 자율개선 라운드(23:22 KST 시작)
- 상태: 진행중
- 시작 계획:
  - manager assign/run에 LLM 하이브리드 라우팅 옵션 연결
  - 라우팅 폴백 사유를 assignment reason/아티팩트에 명시
  - 10분 간격 WORKLOG 갱신 + 완료 단위 커밋/푸시/코멘트
- 코멘트(23:24):
  - `manager.routingStrategy` 설정(`llm-hybrid` 기본값) 추가.
  - `ag manager assign/run`에 `--routing` 옵션을 연결해 전략 전환 가능.
  - LLM 라우팅 실패 시 `llm-fallback -> ...` 이유를 남기도록 assignment reason 확장.
  - README에 전략 사용 예시/설정 키 문서화 반영.
- 코멘트(23:26):
  - manager 실행 집계에 `routing-summary(llm/fallback/heuristic)`를 추가해 관측성을 강화했습니다.
  - `latestOutput` JSON에도 routing 집계를 포함해 후처리 파이프라인에서 바로 활용 가능하게 했습니다.
  - `ag manager status` 요약에 마지막 실행/역할 분포를 추가해 운영 시점 가시성을 개선했습니다.
