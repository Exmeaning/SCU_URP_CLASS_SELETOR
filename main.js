// ==UserScript==
// @name         四川大学URP选课系统选课自动刷新小工具
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  填入你想选择的课号 然后点击开始 小工具会自动刷新 刷新到了有课余量会**弹提醒**
// @author       Exmeaning東雪
// @match        http://zhjw.scu.edu.cn/*
// @supportURL   github.com/Exmeaning/SCU_URP_CLASS_SELETOR/
// @license      MIT
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    let isRightFrame = false;
    let btns = document.querySelectorAll('button, input[type="button"], a.btn, input[type="submit"]');
    for (let b of btns) {
        let txt = b.innerText || b.value || "";
        if (txt.includes('查询') || txt.includes('检索')) {
            isRightFrame = true;
            break;
        }
    }
    
    if (!isRightFrame) return; 
    if (window._scuApiSniper) return; 
    window._scuApiSniper = true;

    // 挂载隐形钩子
    let queryUrl = "";
    let queryPayload = null;

    const originalSend = XMLHttpRequest.prototype.send;
    const originalOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(data) {
        if (this._url && this._url.includes('courseList')) {
            queryUrl = this._url;
            queryPayload = data;
            console.log("✅ 成功截获底层的课表 API: ", this._url, "载荷:", data);
            
            let stat = document.getElementById('scu-status');
            if(stat) {
                stat.innerText = "🟡 已捕获底层参数，可开启监控";
                stat.style.color = "#ffeb3b";
            }
        }
        return originalSend.apply(this, arguments);
    };

    // 核心 API 解析器 (紧盯 kylMap)
    let isRunning = false;
    let timer = null;
    let checkCount = 1;

    async function checkApi() {
        if (!queryUrl || !queryPayload) {
            alert("❌ 程序还没有拿到你的查询条件！请在网页上点击一次原生的【查询】按钮！");
            stopMonitor();
            return;
        }

        let targetCourse = document.getElementById('monitorCourse').value.trim();
        if (!targetCourse) {
            alert("请输入目标课程号 (例如 123456_7)！");
            stopMonitor();
            return;
        }

        try {
            console.log(`[${new Date().toLocaleTimeString()}] 📡 第 ${checkCount} 次刷新后台数据...`);
            let res = await fetch(queryUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: queryPayload
            });

            if (res.status !== 200) return;

            let text = await res.text();
            
            // 安全防风控检测
            if (text.includes('验证码') || text.includes('vcode')) {
                alert("⚠️ 系统对查询接口开始弹验证码了！脚本已暂停，请停止休息几分钟。");
                stopMonitor();
                return;
            }

            let mapRegex = /"kylMap"\s*:\s*({[^}]+})/;
            let match = text.match(mapRegex);
            
            let isAvailable = false;
            let currentKyl = "没查到";

            if (match && match[1]) {
                try {
                    let kylMap = JSON.parse(match[1]);
                    // 遍历所有数据，寻找你的课号 (用 include 可以绕过学期前缀)
                    let foundKey = Object.keys(kylMap).find(k => k.includes(targetCourse));
                    
                    if (foundKey) {
                        currentKyl = parseInt(kylMap[foundKey], 10);
                        console.log(`🔍 查找到目标课程 [${foundKey}]，原始课余量: ${currentKyl}`);
                        
                        // 课余量大于 0 就是空出来了
                        if (currentKyl > 0) {
                            isAvailable = true;
                        }
                    } else {
                        console.log(`⚠️ 全量数据 kylMap 中没有 [${targetCourse}] 这门课，你可能在查询条件里漏选了院系或者类别！`);
                    }
                } catch(e) {}
            }

            // 更新 UI 上面的数据显示
            let detailObj = document.getElementById('scu-detail');
            if(detailObj) {
                detailObj.innerText = `当前名额: ${currentKyl} （请求第${checkCount}次）`;
                if(currentKyl === "没查到") detailObj.style.color = "#888";
                else detailObj.style.color = currentKyl > 0 ? "#00ff00" : "#ff9800";
            }

            //  终级警报器！
            if (isAvailable) {
                playAlarm();
                alert(`🎉🎉🎉 破门报警！！\n你的目标课程【${targetCourse}】放名额了！\n当前绝对剩余名额: ${currentKyl} 人！！\n\n程序自动中止，此时请立刻鼠标狂点原生网页进行结算选定！`);
                stopMonitor();
            }

        } catch(e) {}
        checkCount++;
    }

    function playAlarm() {
        try {
            let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            let oscillator = audioCtx.createOscillator();
            let gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'square';
            oscillator.frequency.value = 850; 
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.1);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 3); 
        } catch(e) {}
    }

    function startMonitor() {
        if (!queryUrl) {
            alert("❗ 请必须先在网页点一下原生的【查询】按钮查出课表结果！如果点不到说明你找错了页面！");
            return;
        }
        if (isRunning) return;
        isRunning = true;
        checkCount = 1;
        let stat = document.getElementById('scu-status');
        if(stat){
            stat.innerText = "🟢 底层全速刷数据中...";
            stat.style.color = "#4caf50";
        }
        
        checkApi(); // 立刻执行
        
        const loop = () => {
            if (!isRunning) return;
            checkApi();
            // 防火墙保护：在 3 ~ 4.5 秒内随机发包请求数据
            let delay = 3000 + Math.random() * 1500;
            timer = setTimeout(loop, delay);
        };
        timer = setTimeout(loop, 3000);
    }

    function stopMonitor() {
        isRunning = false;
        clearTimeout(timer);
        let stat = document.getElementById('scu-status');
        if(stat){
            stat.innerText = "🔴 监控已停止";
            stat.style.color = "#aaa";
        }
    }

    window.addEventListener('load', () => {
        setTimeout(createPanel, 500); 
    });

    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "scu-sniper-panel"; 
        panel.style.position = "fixed";
        panel.style.top = "15%";
        panel.style.right = "20px";
        panel.style.zIndex = "999999";
        panel.style.padding = "15px";
        panel.style.backgroundColor = "rgba(33, 37, 43, 0.95)";
        panel.style.color = "white";
        panel.style.borderRadius = "10px";
        panel.style.boxShadow = "0 6px 20px rgba(0,0,0,0.5)";
        panel.style.fontFamily = "sans-serif";
        panel.style.width = "230px";

        const title = document.createElement("h3");
        title.innerText = "🎯 API 课余量捡漏直通车";
        title.style.margin = "0 0 10px 0";
        title.style.color = "#00d4ff";
        title.style.fontSize = "15px";
        title.style.textAlign = "center";
        panel.appendChild(title);

        const inputDiv = document.createElement("div");
        inputDiv.style.marginBottom = "12px";
        inputDiv.innerHTML = `<label style="font-size:12px;color:#bbb;">你想监控的课号 (例如 104294020_01):</label><br/>
            <input id="monitorCourse" type="text" value="104294020_01" style="width:100%; box-sizing:border-box; padding:6px; margin-top:5px; border-radius:4px; border:1px solid #666; background:#222; color:#00ff00; font-weight:bold; outline:none;" />`;
        panel.appendChild(inputDiv);

        const controlDiv = document.createElement("div");
        controlDiv.style.display = "flex";
        controlDiv.style.justifyContent = "space-between";
        controlDiv.style.marginBottom = "8px";

        const startBtn = document.createElement("button");
        startBtn.innerHTML = "▶ 疯狂暗刷";
        startBtn.style.padding = "6px 25px";
        startBtn.style.cursor = "pointer";
        startBtn.style.backgroundColor = "#4caf50";
        startBtn.style.color = "white";
        startBtn.style.border = "none";
        startBtn.style.borderRadius = "5px";
        startBtn.style.fontWeight = "bold";
        startBtn.onclick = startMonitor;
        controlDiv.appendChild(startBtn);

        const stopBtnUI = document.createElement("button");
        stopBtnUI.innerHTML = "⏹ 停止";
        stopBtnUI.style.padding = "6px 25px";
        stopBtnUI.style.cursor = "pointer";
        stopBtnUI.style.backgroundColor = "#f44336";
        stopBtnUI.style.color = "white";
        stopBtnUI.style.border = "none";
        stopBtnUI.style.borderRadius = "5px";
        stopBtnUI.style.fontWeight = "bold";
        stopBtnUI.onclick = stopMonitor;
        controlDiv.appendChild(stopBtnUI);
        panel.appendChild(controlDiv);

        const statusDiv = document.createElement("div");
        statusDiv.style.fontSize = "13px";
        statusDiv.style.textAlign = "center";
        statusDiv.style.marginTop = "5px";
        statusDiv.style.fontWeight = "bold";
        
        let statusTextObj = document.createElement("span");
        statusTextObj.id = "scu-status";
        statusTextObj.innerText = "🔴 尚未抓包，请点原生查询钮";
        statusTextObj.style.color = "#aaa";
        statusDiv.appendChild(statusTextObj);
        panel.appendChild(statusDiv);

        let detailObj = document.createElement("div");
        detailObj.id = "scu-detail";
        detailObj.style.fontSize = "12px";
        detailObj.style.textAlign = "center";
        detailObj.style.marginTop = "8px";
        detailObj.style.color = "#888";
        detailObj.innerText = "面板状态: 等待第一波数据...";
        panel.appendChild(detailObj);

        document.body.appendChild(panel);
    }
})();
