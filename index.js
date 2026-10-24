require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3009;

// Khởi tạo Gemini AI (Sử dụng gemini-1.5-flash hoặc gemini-pro)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Hàm lấy thời gian UTC+7
function getCurrentTimeUTC7() {
  const now = new Date();
  const offset = 7;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const localTime = new Date(utc + (3600000 * offset));
  const day = String(localTime.getDate()).padStart(2, '0');
  const month = String(localTime.getMonth() + 1).padStart(2, '0');
  const year = localTime.getFullYear();
  const hours = String(localTime.getHours()).padStart(2, '0');
  const minutes = String(localTime.getMinutes()).padStart(2, '0');
  const seconds = String(localTime.getSeconds()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} UTC+7`;
}

// Hàm hỗ trợ gọi API lấy lịch sử phiên
async function fetchSessionsData() {
  const response = await axios.get('https://wtxmd52.tele68.com/v1/txmd5/sessions');
  const data = response.data;
  let sessions = data.list || data;
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error('Không có dữ liệu từ nguồn');
  }
  sessions.sort((a, b) => b.id - a.id);
  return sessions;
}

// --- GIAO DIỆN WEB UI ---
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Dự Đoán Tài Xỉu MD5</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col justify-between font-sans">

    <header class="bg-slate-900 border-b border-slate-800 p-4 text-center sticky top-0 z-50 shadow-lg">
        <h1 class="text-xl font-bold tracking-wider text-amber-400">
            <i class="fa-solid fa-robot mr-2"></i>AI PREDICTION TOOL
        </h1>
        <p class="text-xs text-slate-400 mt-1">Hệ thống phân tích thông minh thời gian thực</p>
    </header>

    <main class="container mx-auto px-4 py-6 max-w-md flex-grow space-y-5">
        
        <div class="flex justify-between items-center bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs text-slate-400">
            <span><i class="fa-regular fa-clock mr-1"></i> <span id="time-now">Đang cập nhật...</span></span>
            <span class="flex items-center text-emerald-400"><span class="h-2 w-2 bg-emerald-500 rounded-full animate-ping mr-1.5"></span> Live Server</span>
        </div>

        <!-- Box 1: Phiên hiện tại -->
        <div class="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl relative overflow-hidden">
            <div class="absolute top-0 right-0 bg-blue-600/20 text-blue-400 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">Phiên hiện tại</div>
            
            <h2 class="text-sm font-semibold text-slate-400 mb-2">Mã Phiên: <span id="cur-phien" class="text-white font-mono">---</span></h2>
            
            <div class="flex items-center justify-between my-4 bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-center">
                <div>
                    <div class="text-[10px] text-slate-500">Xúc xắc 1</div>
                    <div id="dice-1" class="text-lg font-bold text-amber-300">-</div>
                </div>
                <div class="text-slate-600">+</div>
                <div>
                    <div class="text-[10px] text-slate-500">Xúc xắc 2</div>
                    <div id="dice-2" class="text-lg font-bold text-amber-300">-</div>
                </div>
                <div class="text-slate-600">+</div>
                <div>
                    <div class="text-[10px] text-slate-500">Xúc xắc 3</div>
                    <div id="dice-3" class="text-lg font-bold text-amber-300">-</div>
                </div>
                <div class="border-l border-slate-800 pl-3">
                    <div class="text-[10px] text-slate-500">Tổng</div>
                    <div id="cur-tong" class="text-lg font-bold text-cyan-400">-</div>
                </div>
            </div>

            <div class="flex justify-between items-center">
                <span class="text-xs text-slate-400">Kết quả thực tế:</span>
                <span id="cur-ketqua" class="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide bg-slate-800 text-slate-300">Đang tải...</span>
            </div>
        </div>

        <!-- Box 2: KẾT QUẢ AI DỰ ĐOÁN -->
        <div class="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-5 border border-indigo-500/30 shadow-2xl relative overflow-hidden">
            <div class="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">AI Phân Tích</div>

            <h2 class="text-sm font-semibold text-indigo-300 mb-1">Dự Đoán Phiên Tiếp Theo</h2>
            <div class="text-2xl font-black text-indigo-400 font-mono mb-3" id="pred-phien">#------</div>

            <div id="pred-result-box" class="py-4 my-2 text-center rounded-xl bg-slate-950/60 border border-indigo-500/20 flex flex-col items-center justify-center">
                <span class="text-xs text-slate-400 mb-1">ĐỀ XUẤT CỬA CƯỢC</span>
                <span id="pred-choice" class="text-3xl font-black tracking-widest uppercase text-slate-400">BẤM NÚT PHÂN TÍCH</span>
            </div>

            <div class="grid grid-cols-2 gap-3 mt-4 text-xs">
                <div class="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
                    <span class="text-slate-500 block text-[10px]">ĐỘ TIN CẬY</span>
                    <span id="pred-confidence" class="font-bold text-emerald-400 text-sm">--%</span>
                </div>
                <div class="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
                    <span class="text-slate-500 block text-[10px]">TRẠNG THÁI AI</span>
                    <span class="font-bold text-cyan-400 text-sm" id="ai-status">Sẵn sàng</span>
                </div>
            </div>

            <div class="mt-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs">
                <span class="text-slate-500 block text-[10px] mb-1"><i class="fa-solid fa-brain mr-1"></i> NHẬN ĐỊNH CHUYÊN GIA AI:</span>
                <p id="pred-reason" class="text-slate-300 italic">Nhấn nút bên dưới để bắt đầu phân tích dữ liệu...</p>
            </div>
        </div>

        <button onclick="loadPrediction()" id="btn-predict" class="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 transition-all text-white font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2 text-sm">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>CHẠY AI PHÂN TÍCH NGAY</span>
        </button>

    </main>

    <footer class="text-center py-4 text-[10px] text-slate-600 border-t border-slate-900">
        AI Tool v2.1 • Tối ưu hóa cho Mobile / iPhone
    </footer>

    <script>
        async function loadPrediction() {
            const btn = document.getElementById('btn-predict');
            const choiceEl = document.getElementById('pred-choice');
            const reasonEl = document.getElementById('pred-reason');
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i> Đang tải dữ liệu...';
            choiceEl.innerText = "ĐANG XỬ LÝ...";
            choiceEl.className = "text-2xl font-black tracking-widest uppercase text-amber-400 animate-pulse";

            try {
                // 1. Lấy thông tin phiên hiện tại trước
                const resCur = await fetch('/api/lcmd5').then(r => r.json());
                if (resCur.success) {
                    const d = resCur.data;
                    document.getElementById('cur-phien').innerText = d.phien;
                    document.getElementById('dice-1').innerText = d.xuc_xac_1;
                    document.getElementById('dice-2').innerText = d.xuc_xac_2;
                    document.getElementById('dice-3').innerText = d.xuc_xac_3;
                    document.getElementById('cur-tong').innerText = d.tong;
                    
                    const kqEl = document.getElementById('cur-ketqua');
                    kqEl.innerText = d.ket_qua.toUpperCase();
                    if (d.ket_qua.toLowerCase() === 'tai') {
                        kqEl.className = "px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide bg-rose-500/20 text-rose-400 border border-rose-500/30";
                    } else {
                        kqEl.className = "px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide bg-cyan-500/20 text-cyan-400 border border-cyan-500/30";
                    }
                    document.getElementById('time-now').innerText = d.thoi_gian;
                }

                // 2. Gọi API dự đoán AI riêng biệt
                btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i> AI đang phân tích cầu...';
                const resPred = await fetch('/api/predict').then(r => r.json());

                if (resPred.success && resPred.du_doan_ai) {
                    const ai = resPred.du_doan_ai;
                    document.getElementById('pred-phien').innerText = "#" + (ai.phien_du_doan || "---");
                    document.getElementById('pred-confidence').innerText = ai.do_tin_cay || "75%";
                    reasonEl.innerText = ai.ly_do || "Không có mô tả chi tiết.";

                    const prediction = (ai.du_doan || "").toLowerCase();
                    if (prediction === 'tai') {
                        choiceEl.innerText = "TÀI";
                        choiceEl.className = "text-4xl font-black tracking-widest uppercase text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]";
                    } else if (prediction === 'xiu') {
                        choiceEl.innerText = "XỈU";
                        choiceEl.className = "text-4xl font-black tracking-widest uppercase text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]";
                    } else {
                        choiceEl.innerText = prediction.toUpperCase() || "CHỜ KẾT QUẢ";
                        choiceEl.className = "text-2xl font-black tracking-widest uppercase text-slate-300";
                    }
                } else {
                    throw new Error(resPred.message || 'Lỗi phân tích từ AI');
                }
            } catch (err) {
                console.error(err);
                choiceEl.innerText = "LỖI PHÂN TÍCH";
                choiceEl.className = "text-xl font-black tracking-widest uppercase text-rose-500";
                reasonEl.innerText = "Không thể kết nối đến Gemini AI. Vui lòng kiểm tra lại GEMINI_API_KEY trong cài đặt Render.";
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i> CHẠY AI PHÂN TÍCH NGAY';
            }
        }

        window.onload = () => {
            loadPrediction();
        };
    </script>
</body>
</html>
  `);
});

// Endpoint 1: Lấy phiên mới nhất
app.get('/api/lcmd5', async (req, res) => {
  try {
    const sessions = await fetchSessionsData();
    const latest = sessions[0];
    const ketQua = latest.resultTruyenThong ? latest.resultTruyenThong.toLowerCase() : '';
    const phien = latest.id || latest._id;
    const tong = latest.point || 0;
    const xucXac = latest.dices || [0, 0, 0];

    res.json({
      success: true,
      data: {
        ket_qua: ketQua,
        phien: phien,
        thoi_gian: getCurrentTimeUTC7(),
        tong: tong,
        xuc_xac_1: xucXac[0] || 0,
        xuc_xac_2: xucXac[1] || 0,
        xuc_xac_3: xucXac[2] || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// Endpoint 2: AI Dự đoán phiên tiếp theo (An toàn, chống crash)
app.get('/api/predict', async (req, res) => {
  try {
    const sessions = await fetchSessionsData();
    const recentSessions = sessions.slice(0, 15).map(s => ({
      phien: s.id || s._id,
      ket_qua: s.resultTruyenThong ? s.resultTruyenThong.toLowerCase() : '',
      tong: s.point || 0,
      xuc_xac: s.dices || [0, 0, 0]
    }));

    const latestSession = recentSessions[0];
    const nextSessionId = Number(latestSession.phien) + 1;

    const prompt = `
Bạn là chuyên gia phân tích thống kê xác suất. Dựa vào 15 phiên gần nhất sau:
${JSON.stringify(recentSessions)}

Hãy dự đoán phiên tiếp theo (${nextSessionId}).
CHỈ TRẢ VỀ MỘT ĐỐI TƯỢNG JSON THUẦN TÚY, KHÔNG CÓ MARKDOWN, KHÔNG CÓ TEXT THỪA:
{
  "phien_du_doan": ${nextSessionId},
  "du_doan": "tai" hoặc "xiu",
  "do_tin_cay": "78%",
  "ly_do": "Mô tả ngắn gọn dưới 20 từ"
}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Cố gắng lọc JSON an toàn
    let aiPrediction;
    try {
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      aiPrediction = JSON.parse(jsonMatch ? jsonMatch[0] : cleanJson);
    } catch (parseError) {
      aiPrediction = {
        phien_du_doan: nextSessionId,
        du_doan: "tai",
        do_tin_cay: "60%",
        ly_do: "Phân tích ngẫu nhiên theo nhịp cầu hiện tại."
      };
    }

    res.json({
      success: true,
      thoi_gian: getCurrentTimeUTC7(),
      phien_gan_nhat: latestSession,
      du_doan_ai: aiPrediction
    });

  } catch (error) {
    console.error('Lỗi API predict:', error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Lỗi AI phân tích'
    });
  }
});

app.listen(port, () => {
  console.log(`Server đang chạy trên cổng ${port}`);
});
