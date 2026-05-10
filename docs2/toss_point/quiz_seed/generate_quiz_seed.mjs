import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUIZ_SEED_DIR = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PER_GROUP = 200;
const VARIANTS_PER_CONCEPT = 4;
const REVIEW_STATUS = 'draft';
const SOURCE_NOTE = '초안: 불변 기초 개념 기반, 배포 전 사람 검수 필요';

const OX_CHOICES = [
  { id: 'o', label: 'O' },
  { id: 'x', label: 'X' },
];

const groups = [
  {
    prefix: 'STOCK',
    fileName: 'stock_basics.jsonl',
    phase: 'phase_1_core',
    category: 'stock_basic',
    concepts: [
      ['매수', '주식이나 ETF를 사는 행위'],
      ['매도', '주식이나 ETF를 파는 행위'],
      ['주식', '회사의 소유권을 작게 나눈 증권'],
      ['주주', '주식을 보유해 회사의 지분을 가진 사람'],
      ['증권계좌', '주식이나 ETF 같은 금융상품을 거래하기 위한 계좌'],
      ['종목', '거래되는 개별 회사나 금융상품의 이름'],
      ['티커', '종목을 구분하기 위한 짧은 코드'],
      ['호가', '사고팔기 위해 제시된 가격'],
      ['매수호가', '사려는 사람이 제시한 가격'],
      ['매도호가', '팔려는 사람이 제시한 가격'],
      ['시가', '시장이 열린 뒤 처음 체결된 가격'],
      ['종가', '장이 끝날 때 기준이 되는 마지막 가격'],
      ['고가', '일정 기간 동안 가장 높게 거래된 가격'],
      ['저가', '일정 기간 동안 가장 낮게 거래된 가격'],
      ['거래량', '일정 기간 실제로 거래된 수량'],
      ['거래대금', '거래된 가격과 수량을 반영한 금액'],
      ['상장', '회사 주식이 거래소에서 거래될 수 있게 되는 것'],
      ['상장폐지', '거래소에서 더 이상 매매되지 않게 되는 것'],
      ['코스피', '비교적 큰 기업들이 많이 속한 한국의 대표 주식시장'],
      ['코스닥', '성장 기업과 중소형 기업이 많이 속한 한국 주식시장'],
      ['배당금', '회사가 이익의 일부를 주주에게 나누어 주는 돈'],
      ['배당락', '배당 받을 권리가 사라지는 기준 이후 주가가 조정될 수 있는 현상'],
      ['기준일', '권리나 배당 대상자를 정할 때 기준이 되는 날짜'],
      ['권리락', '신주 등 권리를 받을 수 있는 기준이 지난 뒤 가격이 조정될 수 있는 현상'],
      ['보통주', '일반적인 의결권과 배당권을 가진 주식'],
      ['우선주', '보통주보다 배당 등에서 우선 조건이 있을 수 있는 주식'],
      ['의결권', '주주가 회사 의사결정에 참여할 수 있는 권리'],
      ['시가총액', '주가에 발행주식 수를 곱한 회사 가치 지표'],
      ['액면가', '주식 한 주에 정해진 기준 금액'],
      ['주식분할', '주식 수를 늘리고 한 주 가격을 낮추는 행위'],
      ['주식병합', '여러 주를 하나로 합쳐 주식 수를 줄이는 행위'],
      ['공모주', '새로 상장하거나 모집할 때 투자자에게 공개 판매되는 주식'],
      ['청약', '공모주 등을 배정받기 위해 신청하는 절차'],
      ['지정가 주문', '원하는 가격을 지정해 내는 주문'],
      ['시장가 주문', '현재 시장에서 가능한 가격으로 빠르게 체결하려는 주문'],
      ['체결', '주문이 실제 매매로 성립되는 것'],
      ['미체결', '주문이 아직 거래로 성립되지 않은 상태'],
      ['잔고', '계좌에 남아 있는 현금이나 보유 상품'],
      ['평가금액', '보유 수량에 현재 가격을 곱해 계산한 금액'],
      ['평가손익', '현재 평가금액과 매입금액의 차이'],
      ['실현손익', '실제로 매도해서 확정된 손익'],
      ['수익률', '투자금 대비 이익 또는 손실의 비율'],
      ['분산투자', '여러 자산이나 종목에 나누어 투자하는 방법'],
      ['장기투자', '긴 기간 보유를 전제로 하는 투자 방식'],
      ['단기투자', '비교적 짧은 기간의 가격 변화를 노리는 투자 방식'],
      ['변동성', '가격이 오르내리는 정도'],
      ['리스크', '기대와 다르게 손실이 생길 가능성'],
      ['유동성', '원하는 때 사고팔기 쉬운 정도'],
      ['공시', '회사가 중요한 정보를 투자자에게 알리는 제도'],
      ['기업실적', '회사의 매출과 이익 등 경영 결과'],
    ],
  },
  {
    prefix: 'ETF',
    fileName: 'etf_basics.jsonl',
    phase: 'phase_1_core',
    category: 'etf_fund',
    concepts: [
      ['ETF', '거래소에서 주식처럼 사고팔 수 있는 펀드'],
      ['펀드', '여러 투자자의 돈을 모아 운용하는 투자상품'],
      ['지수', '여러 종목의 가격 움직임을 하나의 숫자로 나타낸 것'],
      ['기초지수', 'ETF가 따라가려는 기준 지수'],
      ['구성종목', 'ETF나 지수 안에 포함된 개별 종목'],
      ['순자산가치', 'ETF가 가진 자산에서 비용 등을 뺀 가치'],
      ['괴리율', 'ETF 시장가격과 순자산가치의 차이를 비율로 나타낸 것'],
      ['추적오차', 'ETF 수익률이 기초지수 수익률과 어긋나는 정도'],
      ['분배금', 'ETF가 보유 자산에서 나온 수익 일부를 투자자에게 나눠주는 돈'],
      ['운용보수', 'ETF를 운용하는 대가로 부과되는 비용'],
      ['패시브 ETF', '정해진 지수를 따라가도록 설계된 ETF'],
      ['액티브 ETF', '운용자가 정한 전략에 따라 비교적 적극적으로 운용하는 ETF'],
      ['주식형 ETF', '주식에 주로 투자하는 ETF'],
      ['채권형 ETF', '채권에 주로 투자하는 ETF'],
      ['원자재 ETF', '금이나 원유 같은 원자재 가격에 연동되는 ETF'],
      ['섹터 ETF', '특정 산업군에 집중 투자하는 ETF'],
      ['테마 ETF', '특정 주제나 트렌드에 맞춰 구성된 ETF'],
      ['레버리지 ETF', '기초지수 변동을 배수로 따라가도록 설계된 ETF'],
      ['인버스 ETF', '기초지수와 반대 방향의 수익을 목표로 하는 ETF'],
      ['환헤지', '환율 변동 영향을 줄이기 위한 장치'],
      ['환노출', '환율 변동 영향을 그대로 받을 수 있는 상태'],
      ['해외 ETF', '해외 자산이나 해외 시장에 투자하는 ETF'],
      ['국내 ETF', '국내 거래소에 상장되어 거래되는 ETF'],
      ['배당 ETF', '배당을 많이 주는 종목 위주로 구성된 ETF'],
      ['리츠 ETF', '부동산투자회사 등에 투자하는 ETF'],
      ['채권', '돈을 빌린 주체가 이자와 원금을 갚기로 약속한 증권'],
      ['국채', '국가가 발행하는 채권'],
      ['회사채', '회사가 자금 조달을 위해 발행하는 채권'],
      ['금리', '돈을 빌리거나 맡길 때 붙는 이자율'],
      ['만기', '채권 원금을 돌려받기로 한 날짜'],
      ['듀레이션', '채권 가격이 금리 변화에 얼마나 민감한지 나타내는 지표'],
      ['신용등급', '채권 발행자가 돈을 갚을 가능성을 평가한 등급'],
      ['분산효과', '여러 자산에 나눠 투자해 한 자산 영향이 줄어드는 효과'],
      ['리밸런싱', '목표 비중에 맞게 자산 비중을 다시 조정하는 일'],
      ['정기변경', '지수나 ETF 구성종목을 정해진 주기에 바꾸는 일'],
      ['유동성공급자', 'ETF 거래가 원활하도록 호가를 제시하는 역할'],
      ['호가스프레드', '매수호가와 매도호가의 차이'],
      ['거래소 매매', '거래소에서 정해진 시간에 사고파는 방식'],
      ['시장가격', '실제 거래소에서 거래되는 ETF 가격'],
      ['총보수', '운용보수 등을 포함해 투자자가 부담하는 연간 비용'],
      ['원금보장', '투자 원금을 반드시 돌려준다는 의미'],
      ['추종', '기준이 되는 지수나 자산의 움직임을 따라가려는 것'],
      ['자산운용사', 'ETF나 펀드를 만들고 운용하는 회사'],
      ['설정', 'ETF 운용을 위해 새 수익증권이 만들어지는 과정'],
      ['환매', '펀드나 ETF 수익증권을 현금화하는 절차'],
      ['상장폐지', 'ETF가 거래소에서 더 이상 거래되지 않게 되는 일'],
      ['분배락', '분배금을 받을 권리가 지난 뒤 가격이 조정될 수 있는 현상'],
      ['순자산총액', 'ETF가 보유한 전체 순자산 규모'],
      ['추적대상', 'ETF가 따라가려는 지수나 자산'],
      ['거래단위', '거래소에서 사고팔 수 있는 최소 단위'],
    ],
  },
  {
    prefix: 'ECON',
    fileName: 'economy_basics.jsonl',
    phase: 'phase_1_core',
    category: 'economic_indicator',
    concepts: [
      ['물가', '상품과 서비스 가격의 전반적인 수준'],
      ['인플레이션', '물가가 전반적으로 오르는 현상'],
      ['디플레이션', '물가가 전반적으로 내려가는 현상'],
      ['금리', '돈을 빌리거나 맡길 때 적용되는 이자율'],
      ['기준금리', '중앙은행이 통화정책의 기준으로 삼는 금리'],
      ['중앙은행', '한 나라의 통화와 금융 안정을 담당하는 기관'],
      ['통화', '거래에 쓰이는 돈의 단위나 수단'],
      ['환율', '서로 다른 나라 돈을 바꾸는 비율'],
      ['원화', '대한민국에서 쓰이는 통화'],
      ['달러', '미국 등에서 쓰이는 대표적인 통화 단위'],
      ['GDP', '한 나라 안에서 일정 기간 생산된 재화와 서비스의 총가치'],
      ['경기', '경제 활동이 활발한지 침체되어 있는지를 나타내는 흐름'],
      ['호황', '생산과 소비 등 경제 활동이 활발한 상태'],
      ['불황', '생산과 소비 등 경제 활동이 위축된 상태'],
      ['소비', '재화나 서비스를 사서 사용하는 활동'],
      ['저축', '소득 중 쓰지 않고 모아 두는 돈'],
      ['투자', '미래의 이익을 기대하고 자금을 투입하는 활동'],
      ['수요', '사려는 사람들의 욕구와 구매 의사'],
      ['공급', '팔려는 사람들이 시장에 내놓는 양'],
      ['가격', '재화나 서비스를 사고팔 때 정하는 금액'],
      ['세금', '국가나 지방자치단체가 공공서비스를 위해 걷는 돈'],
      ['예산', '앞으로 쓸 돈과 들어올 돈을 미리 계획한 것'],
      ['무역', '나라 사이에 상품이나 서비스를 사고파는 활동'],
      ['수출', '국내에서 만든 상품이나 서비스를 해외에 파는 일'],
      ['수입', '해외 상품이나 서비스를 국내로 들여오는 일'],
      ['흑자', '들어온 돈이 나간 돈보다 많은 상태'],
      ['적자', '나간 돈이 들어온 돈보다 많은 상태'],
      ['실업률', '일할 의사와 능력이 있지만 일자리가 없는 사람의 비율'],
      ['고용', '사람을 일하게 하고 임금을 지급하는 관계'],
      ['임금', '일한 대가로 받는 돈'],
      ['생산성', '투입한 자원에 비해 얼마나 많이 생산하는지를 나타내는 정도'],
      ['가계', '소비와 저축을 하는 개인이나 가족 단위의 경제 주체'],
      ['기업', '상품이나 서비스를 만들어 판매하는 경제 주체'],
      ['정부', '세금과 정책으로 경제에 영향을 주는 공공 주체'],
      ['은행', '예금과 대출 같은 금융 서비스를 제공하는 기관'],
      ['예금', '은행 등에 돈을 맡기는 것'],
      ['대출', '나중에 갚기로 하고 돈을 빌리는 것'],
      ['이자', '돈을 빌리거나 맡긴 대가로 주고받는 금액'],
      ['복리', '이자에 다시 이자가 붙는 계산 방식'],
      ['단리', '원금에 대해서만 이자가 붙는 계산 방식'],
      ['신용', '돈을 빌리고 약속대로 갚을 수 있다고 보는 믿음'],
      ['담보', '돈을 갚지 못할 때를 대비해 제공하는 자산'],
      ['보험', '미리 보험료를 내고 위험이 생기면 보상을 받는 제도'],
      ['연금', '노후 등에 정기적으로 받도록 마련한 돈'],
      ['기회비용', '하나를 선택해서 포기한 것 중 가장 가치 있는 대안'],
      ['희소성', '자원은 제한되어 있고 원하는 것은 많다는 성질'],
      ['자산', '개인이나 기업이 보유한 경제적 가치가 있는 것'],
      ['부채', '나중에 갚아야 하는 빚이나 의무'],
      ['순자산', '자산에서 부채를 뺀 금액'],
      ['예산관리', '수입과 지출을 계획하고 조정하는 일'],
    ],
  },
];

function makeChoice(id, label) {
  return { id, label };
}

function makeAbChoices(correctLabel, wrongLabel, shouldPutCorrectFirst) {
  if (shouldPutCorrectFirst) {
    return {
      choices: [makeChoice('a', correctLabel), makeChoice('b', wrongLabel)],
      correctChoiceId: 'a',
    };
  }

  return {
    choices: [makeChoice('a', wrongLabel), makeChoice('b', correctLabel)],
    correctChoiceId: 'b',
  };
}

function createBaseQuestion(group, sequence, concept, questionType, question, choices, correctChoiceId, explanation) {
  return {
    human_id: `${group.prefix}-${String(sequence).padStart(4, '0')}`,
    phase: group.phase,
    category: group.category,
    difficulty: 'easy',
    question_type: questionType,
    question,
    choices,
    correct_choice_id: correctChoiceId,
    explanation,
    review_status: REVIEW_STATUS,
    source_note: SOURCE_NOTE,
    topic: concept.term,
  };
}

function normalizeConcept(rawConcept) {
  const [term, definition] = rawConcept;
  return { term, definition };
}

function createQuestionsForGroup(group) {
  const concepts = group.concepts.map(normalizeConcept);

  if (concepts.length * VARIANTS_PER_CONCEPT !== QUESTIONS_PER_GROUP) {
    throw new Error(`${group.prefix} concept count must create exactly ${QUESTIONS_PER_GROUP} questions.`);
  }

  const questions = [];

  concepts.forEach((concept, conceptIndex) => {
    const nextConcept = concepts[(conceptIndex + 7) % concepts.length];
    const distantConcept = concepts[(conceptIndex + 19) % concepts.length];
    const baseSequence = conceptIndex * VARIANTS_PER_CONCEPT;

    questions.push(
      createBaseQuestion(
        group,
        baseSequence + 1,
        concept,
        'ox',
        `다음 설명은 "${concept.term}"에 대한 설명이다: ${concept.definition}`,
        OX_CHOICES,
        'o',
        `정답은 O입니다. "${concept.term}"의 기본 뜻은 "${concept.definition}"입니다.`,
      ),
    );

    const definitionChoices = makeAbChoices(
      concept.term,
      distantConcept.term,
      conceptIndex % 2 === 0,
    );
    questions.push(
      createBaseQuestion(
        group,
        baseSequence + 2,
        concept,
        'ab',
        `다음 설명에 가장 가까운 용어는 무엇인가요? "${concept.definition}"`,
        definitionChoices.choices,
        definitionChoices.correctChoiceId,
        `이 설명은 ${concept.term}에 해당합니다.`,
      ),
    );

    questions.push(
      createBaseQuestion(
        group,
        baseSequence + 3,
        concept,
        'ox',
        `다음 설명은 "${concept.term}"에 대한 설명이다: ${nextConcept.definition}`,
        OX_CHOICES,
        'x',
        `${concept.term}의 뜻은 "${concept.definition}"입니다.`,
      ),
    );

    const sentenceChoices = makeAbChoices(
      `${concept.term}: ${concept.definition}`,
      `${concept.term}: 모든 경우에 원금과 수익을 보장하는 것`,
      conceptIndex % 2 !== 0,
    );
    questions.push(
      createBaseQuestion(
        group,
        baseSequence + 4,
        concept,
        'ab',
        `${concept.term}에 대한 설명으로 더 적절한 것은 무엇인가요?`,
        sentenceChoices.choices,
        sentenceChoices.correctChoiceId,
        `"${concept.term}"의 기본 뜻은 "${concept.definition}"입니다.`,
      ),
    );
  });

  return questions;
}

function assertQuestion(question) {
  if (!Array.isArray(question.choices) || question.choices.length !== 2) {
    throw new Error(`${question.human_id} must have exactly two choices.`);
  }

  const choiceIds = new Set(question.choices.map((choice) => choice.id));
  if (!choiceIds.has(question.correct_choice_id)) {
    throw new Error(`${question.human_id} correct_choice_id does not match choices.`);
  }

  if (question.review_status !== REVIEW_STATUS) {
    throw new Error(`${question.human_id} must remain draft before human review.`);
  }
}

mkdirSync(QUIZ_SEED_DIR, { recursive: true });

const manifest = [];

for (const group of groups) {
  const questions = createQuestionsForGroup(group);
  questions.forEach(assertQuestion);

  const filePath = join(QUIZ_SEED_DIR, group.fileName);
  writeFileSync(filePath, `${questions.map((question) => JSON.stringify(question)).join('\n')}\n`, 'utf8');

  manifest.push({
    file: group.fileName,
    category: group.category,
    count: questions.length,
    review_status: REVIEW_STATUS,
  });
}

writeFileSync(
  join(QUIZ_SEED_DIR, 'manifest.json'),
  `${JSON.stringify({ total_count: QUESTIONS_PER_GROUP * groups.length, files: manifest }, null, 2)}\n`,
  'utf8',
);

writeFileSync(
  join(QUIZ_SEED_DIR, 'README.md'),
  [
    '# 혜택 탭 퀴즈 문제은행 Seed',
    '',
    '이 폴더는 제품 DB 반영 전 검수용 JSONL 문제은행입니다.',
    '',
    '- 총 600문항: 주식 기초 200, ETF 기초 200, 경제 기초 200',
    '- 모든 문항은 `review_status: "draft"` 상태입니다.',
    '- 서비스 노출 전 사람 검수 후 DB seed 또는 migration으로 변환해야 합니다.',
    '- `choices`는 2지선다 또는 O/X만 사용합니다.',
    '- `correct_choice_id`는 반드시 `choices[].id` 중 하나여야 합니다.',
    '- DB 이관 시 검수용 필드(`human_id`, `review_status`, `source_note`, `topic`)는 운영 정책에 따라 별도 보관하거나 제외할 수 있습니다.',
    '',
  ].join('\n'),
  'utf8',
);
