[Slack 보고용 요약]
- 에이전트 매니저 v1 1차 구현 완료
- 추가 사항
  - 역할 프로필/우선순위/키워드 라우팅 도입
  - 매니저 상태 파일(`artifacts/agent-manager-v1.json`) 저장
  - CLI: `ag manager init|status|assign` 추가
  - manager-plan 아티팩트 저장
- 기대 효과
  - Task Group별 역할 분리의 시작점 확보
  - 이후 LLM 라우팅/크로스서피스 루프 강화 작업을 바로 이어갈 수 있는 구조 마련
