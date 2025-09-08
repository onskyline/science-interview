// Netlify Function to securely handle API calls

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 환경 변수에서 값 가져오기
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG; // 이 변수는 현재 이 파일에서 직접 사용되진 않지만, 향후 확장성을 위해 유지합니다.

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

// Netlify 함수의 메인 핸들러
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { type, payload } = JSON.parse(event.body);

        let systemPrompt;
        let userPrompt;
        let responseBody;

        switch (type) {
            case 'question':
                const { topic, category } = payload;
                const subjectName = category === 'math' ? '수학' : '과학';
                systemPrompt = `당신은 과학고 입시 ${subjectName} 면접관입니다. 학생이 제시한 '${topic}' 라는 주제에 대해 ${subjectName} 관련 질문을 생성해야 합니다. 다음 규칙을 반드시 준수하세요:
1.  대한민국의 중학교 ${subjectName} 교육과정 내에서만 질문하세요.
2.  질문의 길이는 반드시 100자 이내로 매우 간결해야 합니다.
3.  단순 지식 확인보다는, 원리를 설명하도록 유도하는 질문을 생성하세요.
4.  생성된 질문 텍스트만 응답하고, 다른 설명은 절대 추가하지 마세요.`;
                userPrompt = `주제: ${topic}`;
                const questionText = await callGeminiAPI(userPrompt, systemPrompt);
                responseBody = { question: questionText };
                break;

            case 'feedback':
                const { question, answer, modelAnswer } = payload;
                systemPrompt = `당신은 과학고 입시 전문 AI 면접관입니다. 학생의 답안에 대해 아래 형식에 맞춰 구체적이고 건설적인 피드백을 제공해주세요.
                - **[잘한 점]**: 학생의 답변에서 긍정적인 부분을 칭찬합니다.
                - **[보완할 점]**: 학생의 답변에서 논리적 오류, 개념적 부정확성, 또는 부족한 부분을 지적합니다.
                - **[추가 조언]**: 더 좋은 답변을 위한 팁이나 관련 심화 개념을 간략히 조언합니다.
                ${modelAnswer ? '학생의 답안과 모범 답안을 비교하여 피드백을 생성하세요.' : '중학교 교육과정 지식에 기반하여 학생 답안의 과학적/수학적 정확성을 평가하고 피드백을 생성하세요.'}`;
                userPrompt = `**질문:** ${question}\n**학생 답안:** ${answer}${modelAnswer ? `\n**모범 답안:** ${modelAnswer}` : ''}`;
                const feedbackText = await callGeminiAPI(userPrompt, systemPrompt);
                responseBody = { feedback: feedbackText };
                break;

            case 'report':
                const { sessionHistory } = payload;
                const historyText = sessionHistory.map((item, index) => 
                    `문항 ${index + 1}: ${item.question}\n답변 ${index + 1}: ${item.answer}\n`
                ).join('\n');
                systemPrompt = `당신은 학생의 면접 기록을 분석하여 종합 리포트를 작성하는 입시 컨설턴트입니다. 아래의 전체 면접 기록을 바탕으로, 학생의 장점과 단점을 분석하고, 앞으로의 학습 방향과 면접 대비 팁을 구체적으로 제시해주세요. 리포트는 다음 형식으로 작성합니다.
                - **[종합 분석]**: 전체 답변 기록을 통해 드러난 학생의 지식 수준, 논리력, 표현력 등을 종합적으로 평가합니다.
                - **[주요 강점]**: 칭찬할 만한 답변이나 일관되게 나타나는 강점을 요약합니다.
                - **[보완 필요 영역]**: 자주 실수하는 개념이나 부족한 부분을 명확히 지적합니다.
                - **[맞춤 학습 전략]**: 보완이 필요한 부분을 개선하기 위한 구체적인 학습 방법을 제안합니다.
                - **[면접 태도 조언]**: 답변 내용 외에, 면접관에게 더 좋은 인상을 줄 수 있는 태도나 말투에 대해 조언합니다.`;
                userPrompt = historyText;
                const reportText = await callGeminiAPI(userPrompt, systemPrompt);
                responseBody = { report: reportText };
                break;

            default:
                return { statusCode: 400, body: 'Invalid request type' };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(responseBody),
        };

    } catch (error) {
        console.error('Error in Netlify function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};

// Gemini API 호출을 위한 헬퍼 함수
async function callGeminiAPI(userPrompt, systemPrompt) {
    const body = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Gemini API Error:', errorBody);
        throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const result = await response.json();
    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
        return result.candidates[0].content.parts[0].text;
    } else {
        console.warn('Gemini API returned no content:', result);
        return "죄송합니다, AI가 응답을 생성할 수 없습니다. 안전 필터에 의해 차단되었거나 다른 문제가 발생했을 수 있습니다.";
    }
}
```

### **두 번째 파일(`api.js`) 저장하기**

1.  **필요한 폴더 만들기:**
    * 바탕화면에 만들어 둔 **`final-interview-app`** 폴더를 엽니다.
    * 그 안에 **`netlify`** 라는 이름으로 새 폴더를 만듭니다.
    * 다시 **`netlify`** 폴더 안으로 들어가서, **`functions`** 라는 이름으로 새 폴더를 하나 더 만듭니다.

2.  **메모장 열고 코드 붙여넣기:**
    * 메모장을 새로 열고, 위에서 복사한 `api.js` 코드를 붙여넣습니다.

3.  **`functions` 폴더 안에 저장하기:**
    * 메모장 메뉴에서 **[파일] > [다른 이름으로 저장]**을 클릭합니다.
    * 저장 위치를 **`final-interview-app` > `netlify` > `functions`** 폴더로 정확히 지정해주세요.
    * **파일 이름:** `api.js` 라고 입력합니다.
    * **파일 형식:** **'모든 파일'**로 변경합니다.
    * **인코딩:** **'UTF-8'**로 선택합니다.
    * **[저장]** 버튼을 누릅니다.

여기까지 마치시면, 선생님의 컴퓨터에는 아래와 같이 완벽한 폴더와 파일 구조가 만들어집니다.

```
final-interview-app/
├── netlify/
│   └── functions/
│       └── api.js  (방금 저장한 파일)
└── public/
    └── index.html (이전에 저장한 파일)

