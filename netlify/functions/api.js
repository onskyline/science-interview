// Netlify Function to securely handle all backend logic
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 환경 변수에서 값 가져오기
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

// Firebase Admin SDK 초기화 (앱이 이미 초기화되었는지 확인)
if (!getApps().length) {
    initializeApp({
        credential: cert(SERVICE_ACCOUNT)
    });
}
const db = getFirestore();

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { type, payload } = JSON.parse(event.body);
        let responseBody;

        switch (type) {
            case 'login':
                const { password } = payload;
                const docRef = db.collection('config').doc('password');
                const docSnap = await docRef.get();

                if (!docSnap.exists) {
                    responseBody = { success: false, message: 'DB에 비밀번호가 없습니다. 관리자에게 문의하세요.' };
                } else {
                    const correctPassword = docSnap.data().value;
                    if (password === correctPassword) {
                        responseBody = { success: true };
                    } else {
                        responseBody = { success: false, message: '비밀번호가 올바르지 않습니다.' };
                    }
                }
                break;
            
            // ... (질문/피드백/리포트 생성 로직은 이전과 동일) ...

            default:
                return { statusCode: 400, body: 'Invalid request type' };
        }
        return { statusCode: 200, body: JSON.stringify(responseBody) };
    } catch (error) {
        console.error('Error in Netlify function:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};

// ... (callGeminiAPI 헬퍼 함수는 이전과 동일) ...
