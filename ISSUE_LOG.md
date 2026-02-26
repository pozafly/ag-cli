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
