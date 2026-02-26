# 이슈 로그 (코멘트 기록)

## 이슈: 에이전트 매니저 v1
- 상태: 완료(1차)
- 코멘트:
  - 역할 프로필(planner/executor/reviewer/researcher) 기본 세트를 도입했습니다.
  - 키워드 + 우선순위 점수 기반 라우팅으로 Task Group별 워커 할당이 가능해졌습니다.
  - `artifacts/agent-manager-v1.json` 파일에 프로필/실행 이력을 누적 저장합니다.
  - `ag manager assign`은 플래닝 후 라우팅 결과를 출력하고 manager-plan 아티팩트를 남깁니다.
  - 다음 단계 제안: (a) LLM 라우터 고도화(역할별 모델 분리), (b) 교차 표면 루프용 이벤트 소스 결합.
