// Orca Plugin: F-yuedu
// 虎鲸笔记PDF阅读插件
// 版本：1.0.0
// 核心特性：在PDF工具栏添加播放按钮，支持使用Edge TTS进行文本语音播放

// 存储插件名称
let pluginName;

// 全局变量
let isPlaying = false;
let currentPageElement = null;
let audioElement = null;
let playBarElement = null;
let currentSegments = [];
let currentSegmentIndex = 0;

// TTS 配置
const ttsConfig = {
    // 系统语音配置
    system: {
        engine: 'browser-tts', // 使用浏览器内置 TTS
        rate: 1.5, // 语速：0.1~10，1为默认
        pitch: 1, // 音调：0~2，1为默认
        volume: 1, // 音量
        language: 'zh-CN', // 语言
        voice: 'zh-CN-XiaoxiaoNeural' // 语音类型
    },
    // 第三方语音配置
    thirdParty: {
        engine: 'local-tts', // 使用本地TTS服务器
        rate: 1, // 语速：0.1~10，1为默认
        volume: 1, // 音量
        localTtsUrl: 'http://localhost:9880', // 本地TTS服务器地址
        localTtsKey: 'sk', // 本地TTS服务器API密钥
        speakerEn: 'af_nicole_女_性感.pt', // 英文语音
        speakerZh: 'zf_xiaoxiao_国语_晓晓.pt', // 中文语音
        speedParamPosition: 'after' // 语速参数位置：'after' 表示在语音参数之后
    },
    // 当前使用的引擎
    currentEngine: 'system' // 'system' 或 'thirdParty'
};

// ---------- 核心：浏览器版 TTS 脚本（无需 ActiveX，兼容 Chrome/Edge/Firefox） ----------
function playSegmentWithBrowserTTS(segment, segments, currentIndex) {
    console.log(`🔧 准备使用浏览器TTS播放段落，长度: ${segment.text.length}`);
    
    // 检查是否应该继续播放
    if (!isPlaying) {
        console.log('⏹️ 播放已停止，跳过当前段');
        return;
    }
    
    // 检查浏览器是否支持 Web Speech API
    if (!('speechSynthesis' in window)) {
        console.error('你的浏览器不支持语音合成功能！');
        playTextSegments(segments, currentIndex + 1);
        return;
    }

    // 等待语音库加载完成（浏览器加载语音列表可能有延迟）
    function getXiaoxiaoVoice() {
        return new Promise((resolve) => {
            // 循环检查，直到语音列表加载完成
            var checkVoice = setInterval(() => {
                var voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    clearInterval(checkVoice);
                    // 找名称含"晓晓"或"Xiaoxiao"的语音
                    var xiaoxiaoVoice = voices.find(voice => 
                        voice.name.includes("晓晓") || voice.name.includes("Xiaoxiao")
                    );
                    resolve(xiaoxiaoVoice);
                }
            }, 100);
        });
    }

    // 配置参数
    const voiceConfig = {
        lang: ttsConfig.system.language, // 语言：zh-CN=中文，en-US=英文
        rate: ttsConfig.system.rate,       // 语速：0.1~10，1为默认
        pitch: ttsConfig.system.pitch,      // 音调：0~2，1为默认
        text: segment.text // 朗读文本
    };

    // 分割文本并逐行朗读
    const textLines = voiceConfig.text.split('\n').filter(line => line.trim() !== '');
    let lineIndex = 0;

    // 主逻辑
    getXiaoxiaoVoice().then(xiaoxiaoVoice => {
        // 朗读单行文本的函数
        function speakLine() {
            if (!isPlaying) {
                console.log('⏹️ 播放已停止，取消当前朗读');
                return;
            }
            
            if (lineIndex >= textLines.length) {
                // 当前段落朗读完成，播放下一段
                console.log(`✅ 第 ${currentIndex + 1} 段文本播放完成 (浏览器TTS)`);
                playTextSegments(segments, currentIndex + 1);
                return;
            }
            
            const utterance = new SpeechSynthesisUtterance(textLines[lineIndex].trim());
            utterance.lang = voiceConfig.lang;
            utterance.rate = voiceConfig.rate;
            utterance.pitch = voiceConfig.pitch;
            
            // 如果找到晓晓语音，使用它
            if (xiaoxiaoVoice) {
                utterance.voice = xiaoxiaoVoice;
                console.log(`✅ 使用晓晓语音: ${xiaoxiaoVoice.name}`);
            } else {
                console.log('⚠️ 未找到晓晓语音，使用默认语音');
            }

            // 读完一行后，延迟500ms读下一行
            utterance.onend = () => {
                lineIndex++;
                setTimeout(speakLine, 500);
            };

            // 朗读错误事件
            utterance.onerror = (error) => {
                console.error(`❌ 朗读错误 (浏览器TTS):`, error);
                lineIndex++;
                setTimeout(speakLine, 500);
            };

            window.speechSynthesis.speak(utterance);
        }

        // 开始朗读
        speakLine();
    });
}

// ---------- 核心：使用本地TTS服务器播放段落 ----------
function playSegmentWithLocalTTS(segment, segments, currentIndex) {
    // 获取文本内容
    const text = segment.text ? segment.text : segment;
    console.log(`🔧 准备使用本地TTS服务器播放段落，长度: ${text.length}`);
    
    // 检查是否应该继续播放
    if (!isPlaying) {
        console.log('⏹️ 播放已停止，跳过当前段');
        return;
    }
    
    console.log('🎤 尝试使用本地TTS服务器播放');
    console.log('📝 文本内容:', text);
    
    try {
        // 构建本地TTS服务器请求URL
        const ttsBaseUrl = ttsConfig.thirdParty.localTtsUrl; // 使用配置文件中的TTS服务器地址
        
        // 构建查询字符串参数
        const params = new URLSearchParams({
            text: text
        });
        
        // 添加语音参数和语速参数
        // 格式：?text=...&speaker_en=...&speaker_zh=...&speed=...
        const ttsUrl = `${ttsBaseUrl}/?${params.toString()}&speaker_en=${ttsConfig.thirdParty.speakerEn}&speaker_zh=${ttsConfig.thirdParty.speakerZh}&speed=${ttsConfig.thirdParty.rate.toString()}`;
        console.log('🌐 本地TTS服务器请求URL:', ttsUrl);
        console.log('📋 完整请求链接:', ttsUrl);
        
        // 测试直接在浏览器中打开URL
        console.log('💡 测试提示：请复制以下URL到浏览器中打开，测试是否能正常获取音频:');
        console.log('🔗 测试URL:', ttsUrl);
        
        // 确保播放栏和音频元素存在
        if (!playBarElement) {
            createPlayBar();
        }
        
        if (!audioElement) {
            console.error('❌ 音频元素不存在');
            playTextSegments(segments, currentIndex + 1);
            return;
        }
        
        // 更新播放栏文本
        updatePlayBarText(`播放第 ${currentIndex + 1} 段: ${text.substring(0, 30)}...`);
        
        console.log('▶️ 开始播放语音 (本地TTS)');
        console.log('📊 播放配置:', {
            text: text.substring(0, 20) + '...',
            speed: ttsConfig.thirdParty.rate,
            volume: ttsConfig.thirdParty.volume
        });
        
        // 设置音频源
        audioElement.src = ttsUrl;
        audioElement.volume = ttsConfig.thirdParty.volume;
        
        // 播放完成事件
        const handleEnded = () => {
            console.log(`✅ 第 ${currentIndex + 1} 段文本播放完成 (本地TTS)`);
            
            // 播放下一段
            if (isPlaying) {
                playTextSegments(segments, currentIndex + 1);
            }
        };
        
        // 播放错误事件
        const handleError = (event) => {
            console.error(`❌ 第 ${currentIndex + 1} 段文本播放错误 (本地TTS):`, event);
            
            // 跳过当前段
            playTextSegments(segments, currentIndex + 1);
        };
        
        // 移除之前的事件监听器
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('error', handleError);
        
        // 添加事件监听器
        audioElement.addEventListener('ended', handleEnded);
        audioElement.addEventListener('error', handleError);
        
        // 尝试直接播放
        audioElement.play().catch(error => {
            console.error('❌ 播放音频失败:', error);
            console.error('错误详情:', error.message, error.name);
            
            // 跳过当前段
            playTextSegments(segments, currentIndex + 1);
        });
        
    } catch (e) {
        console.error('❌ 本地TTS服务器初始化失败:', e);
        console.error('❌ 错误堆栈:', e.stack);
        playTextSegments(segments, currentIndex + 1);
    }
}

// ---------- 核心：播放组合文本（带高亮） ----------
function playCombinedTextWithBrowserTTS(combinedText, segments, currentPageNumber) {
    
    // 检查是否应该继续播放
    if (!isPlaying) {
        console.log('⏹️ 播放已停止，取消播放');
        return;
    }
    
    // 检查浏览器是否支持 Web Speech API
    if (!('speechSynthesis' in window)) {
        console.error('你的浏览器不支持语音合成功能！');
        isPlaying = false;
        updatePlayButtonState();
        return;
    }

    // 等待语音库加载完成（浏览器加载语音列表可能有延迟）
    function getXiaoxiaoVoice() {
        return new Promise((resolve) => {
            // 循环检查，直到语音列表加载完成
            var checkVoice = setInterval(() => {
                var voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    clearInterval(checkVoice);
                    // 找名称含"晓晓"或"Xiaoxiao"的语音
                    var xiaoxiaoVoice = voices.find(voice => 
                        voice.name.includes("晓晓") || voice.name.includes("Xiaoxiao")
                    );
                    resolve(xiaoxiaoVoice);
                }
            }, 100);
        });
    }

    // 配置参数
    const voiceConfig = {
        lang: ttsConfig.system.language, // 语言：zh-CN=中文，en-US=英文
        rate: ttsConfig.system.rate,       // 语速：0.1~10，1为默认
        pitch: ttsConfig.system.pitch,      // 音调：0~2，1为默认
        text: combinedText // 朗读文本
    };

    // 主逻辑
    getXiaoxiaoVoice().then(xiaoxiaoVoice => {
        const utterance = new SpeechSynthesisUtterance(combinedText);
        utterance.lang = voiceConfig.lang;
        utterance.rate = voiceConfig.rate;
        utterance.pitch = voiceConfig.pitch;
        
        // 如果找到晓晓语音，使用它
        if (xiaoxiaoVoice) {
            utterance.voice = xiaoxiaoVoice;
            console.log(`✅ 使用晓晓语音: ${xiaoxiaoVoice.name}`);
        } else {
            console.log('⚠️ 未找到晓晓语音，使用默认语音');
        }

        // 播放开始事件
        utterance.onstart = () => {
            console.log('▶️ 开始播放组合文本');
            // 只在高亮定时器不存在时才开始高亮，避免多次触发导致重置
            if (!highlightTimer) {
                // 开始高亮显示，基于原始片段顺序和字符数计算时间
                startHighlighting(segments);
            }
        };

        // 播放结束事件
        utterance.onend = () => {
            console.log('✅ 组合文本播放完成');
            // 清除所有高亮
            segments.forEach(segment => {
                if (segment.element) {
                    segment.element.style.backgroundColor = '';
                    segment.element.style.color = '';
                }
            });
            
            // 处理下一页逻辑
            handleNextPage(currentPageNumber);
        };

        // 朗读错误事件
        utterance.onerror = (error) => {
            console.error(`❌ 朗读错误 (浏览器TTS):`, error);
            // 清除所有高亮
            segments.forEach(segment => {
                if (segment.element) {
                    segment.element.style.backgroundColor = '';
                    segment.element.style.color = '';
                }
            });
            
            // 处理下一页逻辑
            handleNextPage(currentPageNumber);
        };

        // 开始播放
        window.speechSynthesis.speak(utterance);
    });
}

// ---------- 辅助：更新进度条函数 ----------
function updateProgressBar(progress) {
    const progressOutline = window.orcaPdfProgressOutline;
    if (progressOutline) {
        // 更新外轮廓进度条
        progressOutline.style.background = `linear-gradient(to bottom, #4CAF50 0%, #4CAF50 ${progress}%, #e0e0e0 ${progress}%, #e0e0e0 100%)`;
    }
}

// 全局变量：存储高亮定时器
let highlightTimer = null;

// ---------- 辅助：开始高亮显示函数 ----------
function startHighlighting(segments, startIndex = 0) {
    
    // 清除之前的高亮定时器
    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
        console.log('⏹️ 已清除之前的高亮定时器');
    }
    
    let currentSegmentIndex = startIndex;
    
    // 清除所有高亮
    segments.forEach(segment => {
        if (segment.element) {
            segment.element.style.backgroundColor = '';
            segment.element.style.color = '';
        }
    });
    
    // 高亮当前段
    function highlightCurrentSegment() {
        if (!isPlaying || currentSegmentIndex >= segments.length) {
            // 播放完成，设置进度为100%
            if (currentSegmentIndex >= segments.length) {
                console.log('🏁 高亮完成，共高亮', segments.length, '个片段');
                updateProgressBar(100);
                // 清除所有高亮
                segments.forEach(segment => {
                    if (segment.element) {
                        segment.element.style.backgroundColor = '';
                        segment.element.style.color = '';
                    }
                });
            } else {
                console.log('⏹️ 播放已停止，停止高亮');
                // 清除所有高亮
                segments.forEach(segment => {
                    if (segment.element) {
                        segment.element.style.backgroundColor = '';
                        segment.element.style.color = '';
                    }
                });
            }
            // 清除定时器
            highlightTimer = null;
            return;
        }
        
        // 清除之前的高亮
        segments.forEach((segment, index) => {
            if (index !== currentSegmentIndex && segment.element) {
                segment.element.style.backgroundColor = '';
                segment.element.style.color = '';
            }
        });
        
        // 高亮当前段
        const currentSegment = segments[currentSegmentIndex];
        if (currentSegment.element) {
            currentSegment.element.style.backgroundColor = '#0145ffff';
        }
        
        // 更新进度条
        const progress = ((currentSegmentIndex + 1) / segments.length) * 100;
        updateProgressBar(progress);
        
        // 根据片段文本长度计算高亮时间（每个字符200毫秒）
        const charDuration = 190; // 每个字符的高亮时间（毫秒）
        const duration = currentSegment.text.length * charDuration;
        
        // 延迟一段时间后高亮下一段
        highlightTimer = setTimeout(() => {
            currentSegmentIndex++;
            highlightCurrentSegment();
        }, duration);
    }
    
    // 开始高亮
    updateProgressBar(0); // 初始进度为0%
    highlightCurrentSegment();
}

// ---------- 核心：获取页面文本内容（支持PDF和EPUB） ----------
function getPdfPageText(pageNumber = null) {
    
    // 查找所有.orca-hideable元素
    const hideableElements = document.querySelectorAll('.orca-hideable');
    
    // 检查是否是PDF模式
    let pdfContainer = null;
    for (const element of hideableElements) {
        const container = element.querySelector('.orca-repr-pdf-container.orca-maximized');
        if (container) {
            pdfContainer = container;
            break;
        }
    }
    
    if (pdfContainer) {
        const result = getPdfText(pageNumber);
        return result;
    }
    
    // 检查是否是EPUB模式
    let epubContainer = null;
    for (const element of hideableElements) {
        const container = element.querySelector('.orca-repr-epub-container.orca-maximized');
        if (container) {
            epubContainer = container;
            break;
        }
    }
    
    if (epubContainer) {
        const result = getEpubText();
        return result;
    }
    
    console.warn('⚠️ 未检测到PDF或EPUB模式');
    return { text: '', segments: [], sentences: [] };
}

// ---------- 辅助：提取PDF文本 ----------
function getPdfText(pageNumber = null) {
    
    // 查找所有.orca-hideable元素
    const hideableElements = document.querySelectorAll('.orca-hideable');
    
    // 查找PDF容器
    let pdfContainer = null;
    for (const element of hideableElements) {
        const container = element.querySelector('.orca-repr-pdf-container.orca-maximized');
        if (container) {
            pdfContainer = container;
            break;
        }
    }
    
    if (!pdfContainer) {
        console.warn('⚠️ 未找到PDF容器');
        return { text: '', segments: [], sentences: [] };
    }
    
    // 步骤1: 获取当前页码
    let currentPageNumber = 1;
    
    if (pageNumber) {
        currentPageNumber = pageNumber;
    } else {
        try {
            // 查找页码输入框
            const pageNumInput = pdfContainer.querySelector('.orca-pdf-pagenum-input input');
            if (pageNumInput && pageNumInput.value) {
                currentPageNumber = parseInt(pageNumInput.value, 10);
            }
        } catch (e) {
            console.warn('⚠️ 获取页码时出错:', e);
            currentPageNumber = 1;
        }
    }
    
    // 步骤2: 根据页码查找对应的PDF页面
    let currentPage = null;
    
    // 方法1: 查找对应页码的已加载页面
    const targetPageSelector = `.page[data-page-number="${currentPageNumber}"][data-loaded="true"]`;
    currentPage = pdfContainer.querySelector(targetPageSelector);
    
    if (currentPage) {
    } else {
        // 方法2: 查找对应页码的任何页面（不管是否已加载）
        const anyTargetPageSelector = `.page[data-page-number="${currentPageNumber}"]`;
        currentPage = pdfContainer.querySelector(anyTargetPageSelector);
        
        if (currentPage) {
        } else {
            // 重要修改：如果找不到对应页码的页面，返回空文本
            // 这是为了避免预加载错误的页面语音，导致重复播放
            // 当预加载下一页时，如果下一页还没有加载到DOM中，就跳过预加载
            console.warn(`⚠️ 未找到页码 ${currentPageNumber} 的页面，跳过预加载`);
            return { text: '', segments: [] };
        }
    }
    
    currentPageElement = currentPage;
    
    // 步骤3: 查找文本层
    const textLayer = currentPage.querySelector('.textLayer');
    if (!textLayer) {
        console.warn('⚠️ 未找到PDF文本层');
        // 尝试查找其他可能的文本容器
        const alternativeTextContainers = currentPage.querySelectorAll('div[data-role="text"]');
        if (alternativeTextContainers.length > 0) {
            let pageText = '';
            const segments = [];
            alternativeTextContainers.forEach((container, index) => {
                const text = container.textContent || '';
                pageText += text + ' ';
                segments.push({ text: text.trim(), element: container });
            });
            pageText = pageText.trim().replace(/\s+/g, ' ');
            
            // 处理文本：去除无效字符和空格，按句号拆分
            // 去除所有空格，保留标点符号前后的空格
            let processedText = pageText.replace(/([^\p{P}\s])(\s+)([^\p{P}\s])/gu, '$1$3');
            
            // 按句号拆分文本
            const sentences = processedText.split('。').filter(sentence => sentence.trim().length > 0);
            
            return { text: processedText, segments: segments, sentences: sentences };
        }
        return { text: '', segments: [], sentences: [] };
    }
    
    // 步骤4: 检查文本层是否隐藏
    if (textLayer.hasAttribute('hidden') || textLayer.style.display === 'none') {
        console.warn('⚠️ 文本层被隐藏:', textLayer);
        return { text: '', segments: [], sentences: [] };
    }
    
    // 步骤5: 提取所有文本片段
    const textSpans = Array.from(textLayer.querySelectorAll('span'));
    
    if (textSpans.length === 0) {
        console.warn('⚠️ 未找到文本片段');
        return { text: '', segments: [], sentences: [] };
    }
    
    // 按照页面上的实际位置排序文本片段
    // 首先按照top属性排序，然后按照left属性排序
    textSpans.sort((a, b) => {
        // 提取top和left值
        const getPosition = (element) => {
            const style = element.style;
            const topMatch = style.top.match(/([\d.]+)\%/);
            const leftMatch = style.left.match(/([\d.]+)\%/);
            return {
                top: topMatch ? parseFloat(topMatch[1]) : 0,
                left: leftMatch ? parseFloat(leftMatch[1]) : 0
            };
        };
        
        const posA = getPosition(a);
        const posB = getPosition(b);
        
        // 首先按照top排序
        if (posA.top !== posB.top) {
            return posA.top - posB.top;
        }
        // 然后按照left排序
        return posA.left - posB.left;
    });
    
    let pageText = '';
    const segments = [];
    
    textSpans.forEach((span, index) => {
        const spanText = span.textContent || '';
        pageText += spanText + ' ';
        segments.push({ text: spanText.trim(), element: span });
    });
    
    // 步骤6: 清理文本
    pageText = pageText.trim().replace(/\s+/g, ' ');
    
    // 步骤7: 进一步处理文本，去除无效字符和空格，按句号拆分
    // 去除所有空格，保留标点符号前后的空格
    let processedText = pageText.replace(/([^\p{P}\s])(\s+)([^\p{P}\s])/gu, '$1$3');
    
    // 按句号拆分文本
    const sentences = processedText.split('。').filter(sentence => sentence.trim().length > 0);
    
    return { text: processedText, segments: segments, sentences: sentences };
}

// ---------- 辅助：提取EPUB文本 ----------
function getEpubText() {
    
    // 查找所有.orca-hideable元素
    const hideableElements = document.querySelectorAll('.orca-hideable');
    
    // 查找EPUB容器
    let epubContainer = null;
    for (const element of hideableElements) {
        const container = element.querySelector('.orca-repr-epub-container.orca-maximized');
        if (container) {
            epubContainer = container;
            break;
        }
    }
    
    if (!epubContainer) {
        console.warn('⚠️ 未找到EPUB容器');
        return { text: '', segments: [] };
    }
    
    // 查找EPUB阅读区域
    const epubReaderArea = epubContainer.querySelector('.orca-epub-reader-area');
    if (!epubReaderArea) {
        console.warn('⚠️ 未找到EPUB阅读区域');
        return { text: '', segments: [] };
    }
    
    // 查找EPUB查看器
    const epubViewer = epubReaderArea.querySelector('.orca-epub-viewer');
    if (!epubViewer) {
        console.warn('⚠️ 未找到EPUB查看器');
        return { text: '', segments: [] };
    }
    
    // 查找iframe
    const iframe = epubViewer.querySelector('iframe');
    if (!iframe) {
        console.warn('⚠️ 未找到EPUB iframe');
        return { text: '', segments: [] };
    }
    
    try {
        // 获取iframe中的文档
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) {
            console.warn('⚠️ 无法访问iframe文档');
            return { text: '', segments: [] };
        }
        
        // 提取所有文本元素
        const textElements = iframeDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
        console.log('📊 找到文本元素数量:', textElements.length);
        
        if (textElements.length === 0) {
            console.warn('⚠️ 未找到文本元素');
            return { text: '', segments: [] };
        }
        
        let pageText = '';
        const segments = [];
        
        textElements.forEach((element, index) => {
            const elementText = element.textContent || '';
            pageText += elementText + ' ';
            segments.push({ text: elementText.trim(), element: element });
        });
        
        // 清理文本
        pageText = pageText.trim().replace(/\s+/g, ' ');
        
        // 处理文本：去除无效字符和空格，按句号拆分
        // 去除所有空格，保留标点符号前后的空格
        let processedText = pageText.replace(/([^\p{P}\s])(\s+)([^\p{P}\s])/gu, '$1$3');
        
        // 按句号拆分文本
        const sentences = processedText.split('。').filter(sentence => sentence.trim().length > 0);
        
        return { text: processedText, segments: segments, sentences: sentences };
    } catch (e) {
        console.error('❌ 提取EPUB文本时出错:', e);
        return { text: '', segments: [], sentences: [] };
    }
}

// ---------- 辅助：文本分段函数 ----------
function splitTextIntoSegments(text) {
    const segments = [];
    const maxSegmentLength = 500; // 每段最大长度
    
    // 优先按标点符号分段
    const punctuationRegex = /[。！？；]/g;
    let lastIndex = 0;
    let match;
    
    while ((match = punctuationRegex.exec(text)) !== null) {
        const segmentEnd = match.index + 1;
        const segment = text.substring(lastIndex, segmentEnd);
        
        if (segment.length > maxSegmentLength) {
            // 如果分段过长，进一步按句子拆分
            const subSegments = splitLongSegment(segment, maxSegmentLength);
            segments.push(...subSegments);
        } else if (segment.length > 0) {
            segments.push(segment);
        }
        
        lastIndex = segmentEnd;
    }
    
    // 处理最后一段
    if (lastIndex < text.length) {
        const lastSegment = text.substring(lastIndex);
        if (lastSegment.length > maxSegmentLength) {
            const subSegments = splitLongSegment(lastSegment, maxSegmentLength);
            segments.push(...subSegments);
        } else if (lastSegment.length > 0) {
            segments.push(lastSegment);
        }
    }
    
    return segments;
}

// ---------- 辅助：长文本分段函数 ----------
function splitLongSegment(segment, maxLength) {
    const subSegments = [];
    let currentPosition = 0;
    
    while (currentPosition < segment.length) {
        let endPosition = currentPosition + maxLength;
        
        // 尝试在空格处分割
        if (endPosition < segment.length) {
            const spaceIndex = segment.lastIndexOf(' ', endPosition);
            if (spaceIndex > currentPosition) {
                endPosition = spaceIndex + 1;
            }
        }
        
        subSegments.push(segment.substring(currentPosition, endPosition));
        currentPosition = endPosition;
    }
    
    return subSegments;
}

// ---------- 辅助：分段播放函数 ----------
function playTextSegments(segments, currentIndex) {
    if (currentIndex >= segments.length) {
        // 所有分段播放完成
        console.log('🎤 所有文本分段播放完成');
        
        // 获取当前页码
        let currentPageNumber = 1;
        try {
            // 查找页码输入框
            const pageNumInput = document.querySelector('.orca-pdf-pagenum-input input');
            if (pageNumInput && pageNumInput.value) {
                currentPageNumber = parseInt(pageNumInput.value, 10);
            }
        } catch (e) {
            console.warn('⚠️ 获取页码时出错:', e);
            currentPageNumber = 1;
        }
        
        // 处理下一页逻辑
        handleNextPage(currentPageNumber);
        return;
    }
    
    const currentSegment = segments[currentIndex];
    console.log(`🎤 播放第 ${currentIndex + 1} 段文本，长度: ${currentSegment.length}`);
    console.log(`📝 文本内容: ${currentSegment}`);
    
    // 根据配置选择TTS引擎
    if (ttsConfig.currentEngine === 'thirdParty') {
        // 使用本地TTS服务器播放
        playSegmentWithLocalTTS(currentSegment, segments, currentIndex);
    } else {
        // 使用浏览器TTS播放
        playSegmentWithBrowserTTS(currentSegment, segments, currentIndex);
    }
}

// 全局变量：存储音频对象和临时URL
let currentAudioBlob = null;
let currentAudioUrl = null;

// 全局变量：存储动态播放的列表
let dynamicPlayList = []; // 动态播放列表，存储{pageNumber, audioBlob, audioUrl, text}对象
let currentPlayIndex = -1; // 当前播放的索引
let isDynamicPlayMode = false; // 是否处于动态播放模式
let currentPageSegments = []; // 当前页面的文本片段，用于高亮

// ---------- 辅助：合并多个音频Blob成一个 ----------
async function mergeAudioBlobs(audioBlobs) {
    if (audioBlobs.length === 0) {
        console.warn('⚠️ 没有可合并的音频Blob');
        return null;
    }
    
    if (audioBlobs.length === 1) {
        return audioBlobs[0];
    }
    
    try {
        // 创建一个AudioContext实例
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 存储所有音频缓冲区
        const audioBuffers = [];
        
        // 加载每个音频Blob到缓冲区
        for (let i = 0; i < audioBlobs.length; i++) {
            const response = await fetch(URL.createObjectURL(audioBlobs[i]));
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioBuffers.push(audioBuffer);
        }
        
        // 计算合并后音频的总长度
        const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
        
        // 创建一个新的音频缓冲区，用于存储合并后的音频数据
        const mergedBuffer = audioContext.createBuffer(
            1, // 单声道
            totalLength,
            audioBuffers[0].sampleRate
        );
        
        // 获取合并缓冲区的数据
        const mergedData = mergedBuffer.getChannelData(0);
        
        // 将每个音频缓冲区的数据复制到合并缓冲区
        let offset = 0;
        for (const buffer of audioBuffers) {
            mergedData.set(buffer.getChannelData(0), offset);
            offset += buffer.length;
        }
        
        // 将合并后的音频缓冲区转换回Blob
        const mergedArrayBuffer = await audioBufferToBlob(mergedBuffer);
        const mergedBlob = new Blob([mergedArrayBuffer], { type: 'audio/wav' });
        
        return mergedBlob;
    } catch (error) {
        console.error('❌ 合并音频Blob时出错:', error);
        return null;
    }
}

// ---------- 辅助：将AudioBuffer转换为Blob ----------
async function audioBufferToBlob(audioBuffer) {
    // 直接从AudioBuffer获取通道数据，不需要ScriptProcessorNode
    const channelData = audioBuffer.getChannelData(0);
    const pcmData = new Float32Array(channelData.length);
    pcmData.set(channelData);
    
    // 将Float32Array转换为Int16Array
    const int16Data = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
        // 将Float32值 (-1.0 to 1.0) 转换为Int16值 (-32768 to 32767)
        int16Data[i] = pcmData[i] * 32767;
    }
    
    // 创建WAV文件头
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * 2; // 2 bytes per sample
    const blockAlign = numChannels * 2;
    const bitsPerSample = 16;
    
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    // RIFF标识
    view.setUint32(0, 0x52494646, false); // "RIFF"
    // 文件长度
    view.setUint32(4, 36 + int16Data.length * 2, true);
    // WAVE标识
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // fmt标识
    view.setUint32(12, 0x666d7420, false); // "fmt "
    // 子块长度
    view.setUint32(16, 16, true);
    // 格式类型 (PCM)
    view.setUint16(20, 1, true);
    // 声道数
    view.setUint16(22, numChannels, true);
    // 采样率
    view.setUint32(24, sampleRate, true);
    // 字节率
    view.setUint32(28, byteRate, true);
    // 块对齐
    view.setUint16(32, blockAlign, true);
    // 采样位数
    view.setUint16(34, bitsPerSample, true);
    // data标识
    view.setUint32(36, 0x64617461, false); // "data"
    // 数据长度
    view.setUint32(40, int16Data.length * 2, true);
    
    // 创建合并的ArrayBuffer
    const mergedArrayBuffer = new ArrayBuffer(header.byteLength + int16Data.length * 2);
    const mergedView = new DataView(mergedArrayBuffer);
    
    // 复制WAV文件头
    for (let i = 0; i < header.byteLength; i++) {
        mergedView.setUint8(i, view.getUint8(i));
    }
    
    // 复制PCM数据
    for (let i = 0; i < int16Data.length; i++) {
        mergedView.setUint16(header.byteLength + i * 2, int16Data[i], true);
    }
    
    return mergedArrayBuffer;
}

// ---------- 核心：使用第三方语音服务播放PDF文本（按句拆分并合并语音） ----------
async function playPdfTextWithThirdParty(pageText, currentPageNumber) {
    // 清空动态播放列表
    dynamicPlayList = [];
    currentPlayIndex = -1;
    
    // 获取当前页面的所有文本片段和已处理的句子，存储起来用于整个播放过程的高亮
    const { segments, sentences, text: processedText } = getPdfPageText();
    currentPageSegments = segments;
    
    if (sentences.length === 0) {
        console.warn('⚠️ 没有可播放的句子');
        alert('当前页面没有可播放的文本');
        isPlaying = false;
        updatePlayButtonState();
        return;
    }
    
    // 设置为动态播放模式
    isDynamicPlayMode = true;
    
    // 存储所有音频Blob
    const audioBlobs = [];
    
    // 为每个句子生成语音
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        
        if (sentence.length === 0) {
            continue;
        }
        
        // 生成语音
        const audioBlob = await sendTTSRequest(sentence);
        
        if (audioBlob) {
            // 添加到音频Blob数组
            audioBlobs.push(audioBlob);
        }
    }
    
    if (audioBlobs.length === 0) {
        console.warn('⚠️ 没有可播放的句子');
        alert('当前页面没有可播放的文本');
        isPlaying = false;
        updatePlayButtonState();
        return;
    }
    
    
    
    // 合并音频Blob

    const mergedAudioBlob = await mergeAudioBlobs(audioBlobs);
    
    if (!mergedAudioBlob) {
        console.error('❌ 合并音频Blob失败');
        alert('合并音频失败，请重试');
        isPlaying = false;
        updatePlayButtonState();
        return;
    }
    
    console.log(`✅ 音频Blob合并完成，大小:`, mergedAudioBlob.size, 'bytes');
    
    // 创建合并后的音频URL
    const mergedAudioUrl = URL.createObjectURL(mergedAudioBlob);
    
    // 创建播放项
    const playItem = {
        sentence: processedText,
        audioBlob: mergedAudioBlob,
        audioUrl: mergedAudioUrl,
        text: processedText,
        currentPageNumber: currentPageNumber
    };
    
    // 添加到动态播放列表
    dynamicPlayList.push(playItem);
    
    // 开始高亮显示，基于原始片段顺序和字符数计算时间
    startHighlighting(currentPageSegments);
    
    // 开始播放合并后的音频
    currentPlayIndex = 0;
    playCurrentSentenceInDynamicList(currentPageNumber);
}

// ---------- 辅助：播放动态播放列表中的当前句子 ----------
function playCurrentSentenceInDynamicList(currentPageNumber) {
    if (currentPlayIndex < 0 || currentPlayIndex >= dynamicPlayList.length) {
        console.warn('⚠️ 当前播放索引超出范围，停止播放');
        stopPdfPlayback();
        return;
    }
    
    const currentItem = dynamicPlayList[currentPlayIndex];
    
    // 使用预加载的当前页面文本片段进行高亮
    const sentenceSegments = currentPageSegments;
    console.log(`📊 使用预加载的文本片段进行高亮，片段数量:`, sentenceSegments.length);
    
    // 确保音频元素存在
    if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = 'orca-pdf-audio';
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
    }
    
    // 设置音频源
    audioElement.src = currentItem.audioUrl;
    audioElement.volume = ttsConfig.thirdParty.volume;
    
    // 移除之前的事件监听器
    audioElement.removeEventListener('loadedmetadata', audioElement._onLoadedMetadata);
    audioElement.removeEventListener('play', audioElement._onPlay);
    audioElement.removeEventListener('ended', audioElement._onEnded);
    audioElement.removeEventListener('error', audioElement._onError);
    
    // 音频元数据加载完成事件
    const onLoadedMetadata = () => {
        console.log(`📡 音频元数据加载完成`);
        // 高亮功能现在与音频元数据无关，直接在play事件中处理
    };
    audioElement._onLoadedMetadata = onLoadedMetadata;
    audioElement.addEventListener('loadedmetadata', onLoadedMetadata);
    
    // 播放开始事件
    const onPlay = () => {
        console.log(`▶️ 语音开始播放`);
        // 移除高亮逻辑，高亮在playPdfTextWithThirdParty函数中统一启动
    };
    audioElement._onPlay = onPlay;
    audioElement.addEventListener('play', onPlay);
    
    // 播放完成事件
    const onEnded = () => {
        console.log(`✅ 页码 ${currentPageNumber} 的内容播放完成`);
        
        // 增加播放索引
        currentPlayIndex++;
        
        // 检查是否还有下一个内容
        if (currentPlayIndex < dynamicPlayList.length) {
            console.log(`🔄 准备播放页码 ${currentPageNumber} 的下一个内容`);
            // 延迟一小段时间后播放下一个内容
            setTimeout(() => playCurrentSentenceInDynamicList(currentPageNumber), 100);
        } else {
            console.log(`✅ 页码 ${currentPageNumber} 的所有内容播放完成`);
            
            // 处理下一页逻辑
            handleNextPage(currentPageNumber);
        }
    };
    audioElement._onEnded = onEnded;
    audioElement.addEventListener('ended', onEnded);
    
    // 播放错误事件
    const onError = (error) => {
        console.error(`❌ 页码 ${currentPageNumber} 的内容播放错误:`, error);
        
        // 增加播放索引，尝试播放下一个内容
        currentPlayIndex++;
        
        if (currentPlayIndex < dynamicPlayList.length) {
            console.log(`🔄 尝试播放页码 ${currentPageNumber} 的下一个内容`);
            setTimeout(() => playCurrentSentenceInDynamicList(currentPageNumber), 100);
        } else {
            console.error(`❌ 页码 ${currentPageNumber} 的所有内容播放失败`);
            handleNextPage(currentPageNumber);
        }
    };
    audioElement._onError = onError;
    audioElement.addEventListener('error', onError);
    
    // 开始播放
    try {
        audioElement.play();
        console.log(`▶️ 开始播放页码 ${currentPageNumber} 的内容`);
    } catch (error) {
        console.error(`❌ 播放页码 ${currentPageNumber} 的内容失败:`, error);
        
        // 尝试播放下一个句子
        currentPlayIndex++;
        if (currentPlayIndex < dynamicPlayList.length) {
            console.log(`🔄 尝试播放页码 ${currentPageNumber} 的下一个内容`);
            setTimeout(() => playCurrentSentenceInDynamicList(currentPageNumber), 100);
        } else {
            console.error('❌ 所有内容播放失败');
            handleNextPage(currentPageNumber);
        }
    }
}

// 全局变量：存储预加载的页面数据
let preloadedPages = new Map(); // 存储预加载的页面数据，key为页码，value为{text, segments, audioBlob, audioUrl}
let isPreloading = false; // 标记是否正在预加载

// ---------- 辅助：处理下一页逻辑 ----------
function handleNextPage(currentPageNumber) {
    console.log(`🔄 开始处理下一页逻辑，当前页码: ${currentPageNumber}`);
    
    // 自动跳转到下一页
    const nextPageNumber = currentPageNumber + 1;
    console.log(`📄 尝试跳转到页码: ${nextPageNumber}`);
    
    // 查找下一页按钮
    let nextPageButton = null;
    let isEpubMode = false;
    
    // 首先尝试查找PDF模式下的下一页按钮
    const pdfButtonElement = document.querySelector('button.orca-button.plain > i.ti.ti-arrow-down');
    if (pdfButtonElement) {
        nextPageButton = pdfButtonElement.parentNode;
    }
    
    // 如果找不到PDF模式的按钮，检查是否是EPUB模式
    if (!nextPageButton) {
        // 检查是否存在EPUB相关元素
        const epubContainer = document.querySelector('.orca-repr-epub-container.orca-maximized');
        isEpubMode = !!epubContainer;
    }
    
    if (nextPageButton) {
        nextPageButton.click();
        console.log('✅ 成功点击下一页按钮');
    } else if (isEpubMode) {
        // 在EPUB模式下，使用键盘的方向键右键
        console.log('🔄 在EPUB模式下，模拟方向键右键翻页');
        
        // 创建并分发方向键右键事件
        const event = new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            code: 'ArrowRight',
            keyCode: 39,
            which: 39,
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        // 尝试在EPUB容器或文档上分发事件
        const epubContainer = document.querySelector('.orca-repr-epub-container.orca-maximized');
        if (epubContainer) {
            epubContainer.dispatchEvent(event);
        } else {
            document.dispatchEvent(event);
        }
        
        console.log('✅ 成功模拟方向键右键翻页');
    } else {
        console.error('❌ 未找到下一页按钮，且不是EPUB模式');
        isPlaying = false;
        updatePlayButtonState();
        return;
    }
        
        // 延迟一段时间，等待页面加载完成
        setTimeout(() => {
            // 检查是否有预加载的下一页数据
            const preloadedData = preloadedPages.get(nextPageNumber);
            
            if (preloadedData) {
                console.log(`✅ 找到预加载的页码 ${nextPageNumber} 数据`);
                
                // 开始播放下一页
                isPlaying = true;
                updatePlayButtonState();
                
                // 获取插件设置
                const pluginName = window.pluginName;
                const settings = orca?.state?.plugins?.[pluginName]?.settings;
                const ttsService = settings?.ttsService || 'system';
                
                if (ttsService === '系统语音') {
                    console.log('🎤 开始使用系统语音播放下一页文本');
                    playCombinedTextWithBrowserTTS(preloadedData.text, preloadedData.segments, nextPageNumber);
                } else if (ttsService === '第三方') {
                    console.log('🎤 开始使用第三方语音服务播放下一页文本');
                    playNextPageWithThirdParty(preloadedData, nextPageNumber);
                }
                
                // 预加载下下一页
                preloadNextPage(nextPageNumber);
            } else {
                console.warn(`⚠️ 未找到预加载的页码 ${nextPageNumber} 数据`);
                // 尝试直接获取下一页数据
                const { text: pageText, segments: textSegments } = getPdfPageText(nextPageNumber);
                
                if (pageText && textSegments.length > 0) {
                    console.log(`📝 直接获取页码 ${nextPageNumber} 的文本，长度: ${pageText.length}`);
                    
                    // 开始播放下一页
                    isPlaying = true;
                    updatePlayButtonState();
                    
                    // 获取插件设置
                    const pluginName = window.pluginName;
                    const settings = orca?.state?.plugins?.[pluginName]?.settings;
                    const ttsService = settings?.ttsService || 'system';
                    
                    if (ttsService === '系统语音') {
                        console.log('🎤 开始使用系统语音播放下一页文本');
                        playCombinedTextWithBrowserTTS(pageText, textSegments, nextPageNumber);
                    } else if (ttsService === '第三方') {
                        console.log('🎤 开始使用第三方语音服务播放下一页文本');
                        playPdfTextWithThirdParty(pageText, nextPageNumber);
                    }
                    
                    // 预加载下下一页
                    preloadNextPage(nextPageNumber);
                } else {
                    console.warn(`⚠️ 页码 ${nextPageNumber} 没有可播放的文本`);
                    isPlaying = false;
                    updatePlayButtonState();
                }
            }
        }, 1000); // 1秒延迟，确保页面加载完成
}

// ---------- 辅助：使用第三方语音服务播放下一页 ----------
function playNextPageWithThirdParty(preloadedData, nextPageNumber) {
    console.log(`🎤 开始使用第三方语音服务播放页码 ${nextPageNumber} 的文本`);
    
    // 确保音频元素存在
    if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = 'orca-pdf-audio';
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
    }
    
    // 设置音频源
    audioElement.src = preloadedData.audioUrl;
    audioElement.volume = ttsConfig.thirdParty.volume;
    
    // 播放开始事件
    audioElement.onplay = () => {
        console.log(`▶️ 页码 ${nextPageNumber} 的语音开始播放`);
        
        // 如果有文本片段，开始高亮显示
        if (preloadedData.segments && preloadedData.segments.length > 0 && !highlightTimer) {
            console.log(`📊 页码 ${nextPageNumber} 有 ${preloadedData.segments.length} 个文本片段，开始高亮显示`);
            startHighlighting(preloadedData.segments);
        }
    };
    
    // 播放完成事件
    audioElement.onended = () => {
        console.log(`✅ 页码 ${nextPageNumber} 的语音播放完成`);
        
        // 清除所有高亮
        if (preloadedData.segments && preloadedData.segments.length > 0) {
            preloadedData.segments.forEach(segment => {
                if (segment.element) {
                    segment.element.style.backgroundColor = '';
                    segment.element.style.color = '';
                }
            });
        }
        
        // 处理下一页逻辑
        handleNextPage(nextPageNumber);
    };
    
    // 播放错误事件
    audioElement.onerror = (error) => {
        console.error(`❌ 页码 ${nextPageNumber} 的语音播放错误:`, error);
        
        // 清除所有高亮
        if (preloadedData.segments && preloadedData.segments.length > 0) {
            preloadedData.segments.forEach(segment => {
                if (segment.element) {
                    segment.element.style.backgroundColor = '';
                    segment.element.style.color = '';
                }
            });
        }
        
        // 处理下一页逻辑
        handleNextPage(nextPageNumber);
    };
    
    // 开始播放
    try {
        audioElement.play();
        console.log(`▶️ 开始播放页码 ${nextPageNumber} 的语音 (本地TTS服务器)`);
    } catch (error) {
        console.error(`❌ 播放页码 ${nextPageNumber} 的语音失败:`, error);
        handleNextPage(nextPageNumber);
    }
}

// ---------- 辅助：预加载下一页文本和语音 ----------
async function preloadNextPage(currentPageNumber) {
    if (isPreloading) return;
    
    const nextPageNumber = currentPageNumber + 1;
    
    // 限制预加载的页面数量，最多预加载2页
    if (nextPageNumber - currentPageNumber > 2) {
        console.log(`🔄 已达到预加载页面数量限制，停止预加载`);
        return;
    }
    
    console.log(`🔄 开始预加载页码 ${nextPageNumber} 的文本和语音...`);
    
    isPreloading = true;
    
    try {
        // 提取下一页的文本
        const { text: pageText, segments: textSegments } = getPdfPageText(nextPageNumber);
        
        // 检查提取的文本是否来自正确的页码
        // 如果找不到对应页码的页面，getPdfText会返回当前页的文本，这会导致重复播放
        // 所以需要检查当前页码输入框的值，确保提取的是正确页码的文本
        let actualPageNumber = currentPageNumber;
        try {
            const hideableElements = document.querySelectorAll('.orca-hideable');
            for (const element of hideableElements) {
                const container = element.querySelector('.orca-repr-pdf-container.orca-maximized');
                if (container) {
                    const pageNumInput = container.querySelector('.orca-pdf-pagenum-input input');
                    if (pageNumInput && pageNumInput.value) {
                        actualPageNumber = parseInt(pageNumInput.value, 10);
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ 获取实际页码时出错:', e);
        }
        
        // 如果提取的文本可能来自当前页（而不是目标页码），则跳过预加载
        // 这是为了避免预加载错误的页面语音，导致重复播放
        if (actualPageNumber !== currentPageNumber) {
            console.warn(`⚠️ 页面已跳转，跳过预加载页码 ${nextPageNumber}`);
            isPreloading = false;
            return;
        }
        
        if (!pageText || textSegments.length === 0) {
            console.warn(`⚠️ 页码 ${nextPageNumber} 没有可播放的文本`);
            isPreloading = false;
            return;
        }
        
        console.log(`📝 页码 ${nextPageNumber} 的文本长度:`, pageText.length);
        
        // 处理文本：去除无效字符和空格，按句号拆分
        // 1. 去除首尾空格
        // 2. 将多个连续空格替换为单个空格
        let processedText = pageText.trim().replace(/\s+/g, ' ');
        // 去除所有空格，保留标点符号前后的空格
        processedText = processedText.replace(/([^\p{P}\s])(\s+)([^\p{P}\s])/gu, '$1$3');
        console.log(`📝 页码 ${nextPageNumber} 去除空格后的文本:`, processedText);
        
        // 按句号拆分文本
        const sentences = processedText.split('。').filter(sentence => sentence.trim().length > 0);
        
        if (sentences.length === 0) {
            console.warn(`⚠️ 页码 ${nextPageNumber} 没有可播放的句子`);
            isPreloading = false;
            return;
        }
        
        // 存储所有音频Blob
        const audioBlobs = [];
        
        // 为每个句子生成语音
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            
            if (sentence.length === 0) {
                continue;
            }
            

            
            // 生成语音
            const audioBlob = await sendTTSRequest(sentence);
            
            if (audioBlob) {
                // 添加到音频Blob数组
                audioBlobs.push(audioBlob);

            } else {
                console.error(`❌ 未能生成页码 ${nextPageNumber} 句子 ${i + 1} 的语音`);
            }
        }
        
        if (audioBlobs.length === 0) {
            console.warn(`⚠️ 页码 ${nextPageNumber} 没有可播放的句子`);
            isPreloading = false;
            return;
        }
        
        console.log(`✅ 页码 ${nextPageNumber} 所有句子的语音生成完成，音频Blob数量:`, audioBlobs.length);
        
        // 合并音频Blob
        console.log(`🔄 开始合并页码 ${nextPageNumber} 的音频Blob...`);
        const mergedAudioBlob = await mergeAudioBlobs(audioBlobs);
        
        if (!mergedAudioBlob) {
            console.error(`❌ 合并页码 ${nextPageNumber} 的音频Blob失败`);
            isPreloading = false;
            return;
        }
        
        console.log(`✅ 页码 ${nextPageNumber} 的音频Blob合并完成，大小:`, mergedAudioBlob.size, 'bytes');
        
        // 创建合并后的音频URL
        const audioUrl = URL.createObjectURL(mergedAudioBlob);
        console.log(`🔗 页码 ${nextPageNumber} 的音频临时URL:`, audioUrl);
        
        // 存储预加载数据
        preloadedPages.set(nextPageNumber, {
            text: pageText,
            segments: textSegments,
            audioBlob: mergedAudioBlob,
            audioUrl: audioUrl
        });
        
        console.log(`✅ 页码 ${nextPageNumber} 预加载完成`);
        
        // 预加载下下一页
        preloadNextPage(nextPageNumber);
        
    } catch (error) {
        console.error(`❌ 预加载页码 ${nextPageNumber} 时出错:`, error);
    } finally {
        isPreloading = false;
    }
}

// ---------- 核心：语音播放功能 ----------
async function playPdfText() {
    console.log('🎤 准备使用本地TTS服务器播放PDF文本');
    
    // 获取插件设置
    const pluginName = window.pluginName;
    const settings = orca?.state?.plugins?.[pluginName]?.settings;
    const ttsService = settings?.ttsService || 'system';
    
    // 调试：打印当前状态
    console.log('🔍 当前播放状态:', {
        isPlaying,
        audioElement: !!audioElement,
        audioElementPaused: audioElement?.paused,
        audioElementSrc: audioElement?.src
    });
    
    // 如果音频元素存在，检查其状态
    if (audioElement) {
        // 如果音频正在播放，暂停它
        if (!audioElement.paused) {
            console.log('⏸️ 暂停PDF文本播放');
            audioElement.pause();
            isPlaying = false; // 设置为false，这样按钮会显示播放图标
            updatePlayButtonState();
            return;
        }
        // 如果音频已暂停，继续播放
        else {
            console.log('▶️ 继续PDF文本播放');
            isPlaying = true; // 设置为true，这样按钮会显示暂停图标
            audioElement.play();
            updatePlayButtonState();
            return;
        }
    }
    
    // 如果音频元素不存在，开始新的播放
    console.log('▶️ 开始新的PDF文本播放');
    
    // 停止之前的播放
    stopPdfPlayback();
    
    // 获取当前页码
    let currentPageNumber = 1;
    try {
        // 查找页码输入框
        const hideableElements = document.querySelectorAll('.orca-hideable');
        let pdfContainer = null;
        for (const element of hideableElements) {
            const container = element.querySelector('.orca-repr-pdf-container.orca-maximized');
            if (container) {
                pdfContainer = container;
                break;
            }
        }
        
        if (pdfContainer) {
            const pageNumInput = pdfContainer.querySelector('.orca-pdf-pagenum-input input');
            if (pageNumInput && pageNumInput.value) {
                currentPageNumber = parseInt(pageNumInput.value, 10);
                console.log('📄 从输入框获取当前页码:', currentPageNumber);
            } else {
                console.log('🔄 未找到页码输入框，使用默认页码:', currentPageNumber);
            }
        }
    } catch (e) {
        console.warn('⚠️ 获取页码时出错:', e);
        currentPageNumber = 1;
    }
    
    // 清空预加载数据
    preloadedPages.clear();
    
    // 开始预加载下一页
    preloadNextPage(currentPageNumber);
    
    // 获取页面文本和片段
    const { text: pageText, segments: textSegments } = getPdfPageText();
    if (!pageText || textSegments.length === 0) {
        console.warn('⚠️ 没有可播放的文本');
        alert('当前页面没有可播放的文本');
        return;
    }
    
    console.log('📝 提取的PDF页面文本:', pageText);
    console.log('📝 文本长度:', pageText.length);
    console.log(`📊 找到文本片段数量: ${textSegments.length}`);
    
    // 更新TTS配置
    if (settings) {
        ttsConfig.system.rate = settings.ttsRate || 1;
        ttsConfig.system.pitch = settings.ttsPitch || 1;
        ttsConfig.thirdParty.rate = settings.ttsRate || 0.6;
    }
    
    // 开始播放
    isPlaying = true;
    updatePlayButtonState();
    
    if (ttsService === '系统语音') {
        console.log('🎤 开始使用系统语音播放PDF文本');
        // 组合片段文本后播放
        playCombinedTextWithBrowserTTS(pageText, textSegments, currentPageNumber);
    } else if (ttsService === '第三方') {
        console.log('🎤 开始使用第三方语音服务播放PDF文本');
        
        // 处理当前页文本：按句号拆分，分批生成语音
        await playPdfTextWithThirdParty(pageText, currentPageNumber);
    }
}

// ---------- 辅助：播放动态播放列表中的当前项目 ----------
function playCurrentItemInDynamicList() {
    if (currentPlayIndex < 0 || currentPlayIndex >= dynamicPlayList.length) {
        console.warn('⚠️ 当前播放索引超出范围，停止播放');
        stopPdfPlayback();
        return;
    }
    
    const currentItem = dynamicPlayList[currentPlayIndex];
    
    // 获取当前页码的文本片段
    const { segments } = getPdfPageText(currentItem.pageNumber);
    
    // 确保音频元素存在
    if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = 'orca-pdf-audio';
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
    }
    
    // 设置音频源
    audioElement.src = currentItem.audioUrl;
    audioElement.volume = ttsConfig.thirdParty.volume;
    
    // 音频元数据加载完成事件
    audioElement.onloadedmetadata = () => {
        console.log(`📡 页码 ${currentItem.pageNumber} 的音频元数据加载完成`);
        // 高亮功能现在与音频元数据无关，直接在play事件中处理
    };
    
    // 播放开始事件
    audioElement.onplay = () => {
        console.log(`▶️ 页码 ${currentItem.pageNumber} 的语音开始播放`);
        
        // 如果有文本片段，开始高亮显示
        if (segments && segments.length > 0 && !highlightTimer) {
            console.log(`📊 页码 ${currentItem.pageNumber} 有 ${segments.length} 个文本片段，开始高亮显示`);
            // 开始高亮显示，基于原始片段顺序和字符数计算时间
            startHighlighting(segments);
        }
    };
    
    // 播放完成事件
    audioElement.onended = () => {
        console.log(`✅ 页码 ${currentItem.pageNumber} 的语音播放完成`);
        
        // 清除所有高亮
        if (segments && segments.length > 0) {
            segments.forEach(segment => {
                if (segment.element) {
                    segment.element.style.backgroundColor = '';
                    segment.element.style.color = '';
                }
            });
        }
        
        // 增加播放索引
        currentPlayIndex++;
        
        // 检查是否还有下一页
        if (currentPlayIndex < dynamicPlayList.length) {
            console.log(`🔄 准备播放下一页: ${dynamicPlayList[currentPlayIndex].pageNumber}`);
            // 延迟一小段时间后播放下一页
            setTimeout(playCurrentItemInDynamicList, 500);
        } else {
            console.log('✅ 所有页面的语音播放完成');
            stopPdfPlayback();
        }
    };
    
    // 播放错误事件
    audioElement.onerror = (error) => {
        console.error(`❌ 页码 ${currentItem.pageNumber} 的语音播放错误:`, error);
        
        // 清除所有高亮
        if (segments && segments.length > 0) {
            segments.forEach(segment => {
                if (segment.element) {
                    segment.element.style.backgroundColor = '';
                    segment.element.style.color = '';
                }
            });
        }
        
        // 增加播放索引，尝试播放下一页
        currentPlayIndex++;
        
        if (currentPlayIndex < dynamicPlayList.length) {
            console.log(`🔄 尝试播放下一页: ${dynamicPlayList[currentPlayIndex].pageNumber}`);
            setTimeout(playCurrentItemInDynamicList, 500);
        } else {
            console.error('❌ 所有页面的语音播放失败');
            stopPdfPlayback();
        }
    };
    
    // 标记是否已经开始播放
    let isPlayInitiated = false;
    
    // 修改 onloadedmetadata 事件，在元数据加载完成后开始播放
    const originalOnLoadedMetadata = audioElement.onloadedmetadata;
    audioElement.onloadedmetadata = function() {
        // 调用原始的事件处理函数
        if (originalOnLoadedMetadata) {
            originalOnLoadedMetadata.call(this);
        }
        
        // 如果还没有开始播放，现在开始播放
        if (!isPlayInitiated) {
            isPlayInitiated = true;
            try {
                audioElement.play();
                console.log(`🎤 开始播放页码 ${currentItem.pageNumber} 的语音 (本地TTS服务器)`);
            } catch (error) {
                console.error(`❌ 播放页码 ${currentItem.pageNumber} 的语音失败:`, error);
                
                // 清除所有高亮
                if (segments && segments.length > 0) {
                    segments.forEach(segment => {
                        if (segment.element) {
                            segment.element.style.backgroundColor = '';
                            segment.element.style.color = '';
                        }
                    });
                }
                
                // 增加播放索引，尝试播放下一页
                currentPlayIndex++;
                
                if (currentPlayIndex < dynamicPlayList.length) {
                    console.log(`🔄 尝试播放下一页: ${dynamicPlayList[currentPlayIndex].pageNumber}`);
                    setTimeout(playCurrentItemInDynamicList, 500);
                } else {
                    console.error('❌ 所有页面的语音播放失败');
                    stopPdfPlayback();
                }
            }
        }
    };
    
    // 强制加载音频元数据
    audioElement.load();
    
    // 设置超时，如果元数据加载超时，使用默认值并开始播放
    setTimeout(() => {
        if (!isPlayInitiated) {
            isPlayInitiated = true;
            console.warn(`⚠️  音频元数据加载超时，使用默认值开始播放`);
            try {
                audioElement.play();
                console.log(`🎤 开始播放页码 ${currentItem.pageNumber} 的语音 (使用默认时长)`);
            } catch (error) {
                console.error(`❌ 播放页码 ${currentItem.pageNumber} 的语音失败:`, error);
                
                // 清除所有高亮
                if (segments && segments.length > 0) {
                    segments.forEach(segment => {
                        if (segment.element) {
                            segment.element.style.backgroundColor = '';
                            segment.element.style.color = '';
                        }
                    });
                }
                
                // 增加播放索引，尝试播放下一页
                currentPlayIndex++;
                
                if (currentPlayIndex < dynamicPlayList.length) {
                    console.log(`🔄 尝试播放下一页: ${dynamicPlayList[currentPlayIndex].pageNumber}`);
                    setTimeout(playCurrentItemInDynamicList, 500);
                } else {
                    console.error('❌ 所有页面的语音播放失败');
                    stopPdfPlayback();
                }
            }
        }
    }, 3000); // 3秒超时
}

// ---------- 核心：停止语音播放 ----------
function stopPdfPlayback() {
    console.log('⏹️ 开始停止PDF文本播放');
    
    // 保存动态播放模式标志，用于后续的跳转逻辑
    const wasDynamicPlayMode = isDynamicPlayMode;
    
    // 停止浏览器TTS播放
    if (window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
            console.log('✅ 已停止浏览器TTS播放');
        } catch (e) {
            console.error('❌ 停止浏览器TTS播放失败:', e);
        }
    }
    
    // 停止音频播放
    if (audioElement) {
        try {
            // 移除所有事件监听器
            audioElement.removeEventListener('loadedmetadata', audioElement._onLoadedMetadata);
            audioElement.removeEventListener('play', audioElement._onPlay);
            audioElement.removeEventListener('ended', audioElement._onEnded);
            audioElement.removeEventListener('error', audioElement._onError);
            
            // 暂停播放并重置时间
            audioElement.pause();
            audioElement.currentTime = 0;
            console.log('✅ 已停止音频播放并移除事件监听器');
        } catch (e) {
            console.error('❌ 停止音频播放失败:', e);
        }
    }
    
    // 清除高亮定时器
    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
        console.log('✅ 已清除高亮定时器');
    }
    
    // 释放临时URL
    if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
        console.log('✅ 已释放音频临时URL');
    }
    
    // 清理预加载数据
    if (preloadedPages.size > 0) {
        console.log('🗑️ 开始清理预加载数据...');
        
        // 释放所有预加载的音频URL
        for (const [pageNumber, data] of preloadedPages.entries()) {
            if (data.audioUrl) {
                try {
                    URL.revokeObjectURL(data.audioUrl);
                } catch (e) {
                    console.error(`❌ 释放页码 ${pageNumber} 的音频临时URL失败:`, e);
                }
            }
        }
        
        // 清空预加载数据
        preloadedPages.clear();
        isPreloading = false;
        
        console.log('✅ 预加载数据已清理');
    }
    
    // 清理动态播放列表
    if (dynamicPlayList.length > 0) {
        console.log('🗑️ 开始清理动态播放列表...');
        
        // 释放所有临时URL
        for (const item of dynamicPlayList) {
            if (item.audioUrl) {
                try {
                    URL.revokeObjectURL(item.audioUrl);
                } catch (e) {
                    console.error('❌ 释放音频临时URL失败:', e);
                }
            }
        }
        
        // 清空列表
        dynamicPlayList = [];
        currentPlayIndex = -1;
        isDynamicPlayMode = false;
        
        console.log('✅ 动态播放列表已清理');
    }
    
    // 清理音频Blob
    currentAudioBlob = null;
    
    // 清理播放状态
    isPlaying = false;
    
    // 重置当前片段和索引
    currentSegments = [];
    currentSegmentIndex = 0;
    currentPageSegments = []; // 清空预加载的页面文本片段
    
    // 重置进度条
    updateProgressBar(0);
    
    // 更新播放按钮状态
    updatePlayButtonState();
    
    // 移除音频元素
    removePlayBar();
    
    console.log('✅ PDF文本播放已完全停止');
    
    // 跳转逻辑已移到handleNextPage函数中
}

// ---------- 核心：暂停语音播放 ----------
function pausePdfPlayback() {
    console.log('⏸️ 开始暂停PDF文本播放');
    
    // 暂停浏览器TTS播放
    if (window.speechSynthesis) {
        try {
            window.speechSynthesis.pause();
            console.log('✅ 已暂停浏览器TTS播放');
        } catch (e) {
            console.error('❌ 暂停浏览器TTS播放失败:', e);
        }
    }
    
    // 暂停音频播放（兼容旧逻辑）
    if (audioElement) {
        try {
            audioElement.pause();
            console.log('✅ 已暂停音频播放');
        } catch (e) {
            console.error('❌ 暂停音频播放失败:', e);
        }
    }
    
    // 清除高亮定时器
    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
        console.log('✅ 已暂停高亮显示');
    }
    
    // 不要重置isPlaying为false，这样才能继续播放
    // isPlaying = false;
    
    // 更新播放按钮状态
    updatePlayButtonState();
    
    console.log('✅ PDF文本播放已暂停');
}

// ---------- 核心：继续语音播放 ----------
function resumePdfPlayback() {
    console.log('▶️ 开始继续PDF文本播放');
    
    // 继续浏览器TTS播放
    if (window.speechSynthesis) {
        try {
            window.speechSynthesis.resume();
            console.log('✅ 已继续浏览器TTS播放');
        } catch (e) {
            console.error('❌ 继续浏览器TTS播放失败:', e);
        }
    }
    
    // 继续音频播放（兼容旧逻辑）
    if (audioElement) {
        try {
            audioElement.play();
            console.log('✅ 已继续音频播放');
        } catch (e) {
            console.error('❌ 继续音频播放失败:', e);
        }
    }
    
    // 更新播放状态
    isPlaying = true;
    
    // 更新播放按钮状态
    updatePlayButtonState();
    
    console.log('✅ PDF文本播放已继续');
}

// ---------- 辅助：创建音频元素 ----------
function createPlayBar() {
    console.log('🎛️ 创建音频元素...');
    
    // 检查是否已存在音频元素
    if (audioElement) {
        console.log('🎛️ 音频元素已存在，返回现有实例');
        return audioElement;
    }
    
    // 创建音频元素
    const audio = document.createElement('audio');
    audio.id = 'orca-pdf-audio';
    audio.style.display = 'none';
    
    // 添加到页面
    document.body.appendChild(audio);
    
    // 存储引用
    audioElement = audio;
    playBarElement = audio;
    
    // 音频结束事件
    audio.addEventListener('ended', () => {
        console.log('✅ 音频播放完成');
        isPlaying = false;
    });
    
    // 音频错误事件
    audio.addEventListener('error', (error) => {
        console.error('❌ 音频播放错误:', error);
        isPlaying = false;
    });
    
    console.log('🎛️ 音频元素创建完成');
    return audio;
}

// ---------- 辅助：移除音频元素 ----------
function removePlayBar() {
    console.log('🎛️ 移除音频元素...');
    
    if (audioElement && audioElement.parentNode) {
        audioElement.pause();
        audioElement.src = '';
        audioElement.parentNode.removeChild(audioElement);
        audioElement = null;
        playBarElement = null;
    }
    
    console.log('🎛️ 音频元素已移除');
}

// ---------- 辅助：更新播放栏文本 ----------
function updatePlayBarText(text) {
    console.log(`📢 更新播放栏文本: ${text}`);
    // 这里可以添加更新播放栏文本的逻辑
    // 由于我们没有实际的播放栏UI，只是记录日志
}

// 错误跟踪标志
let ttsErrorShown = false;

// ---------- 辅助：发送TTS请求并获取音频Blob ----------
async function sendTTSRequest(text, abortSignal) {
    
    // 检查是否已经有错误
    if (ttsErrorShown) {
        return null;
    }
    
    // 使用第三方语音服务配置
    const ttsUrl = ttsConfig.thirdParty.localTtsUrl;
    const ttsKey = ttsConfig.thirdParty.localTtsKey;
    
    // 构建查询字符串参数
    const params = new URLSearchParams({
        text: text
    });
    
    // 添加语音参数和语速参数
    // 格式：?text=...&speaker_en=...&speaker_zh=...&speed=...
    const fullUrl = `${ttsUrl}/?${params.toString()}&speaker_en=${ttsConfig.thirdParty.speakerEn}&speaker_zh=${ttsConfig.thirdParty.speakerZh}&speed=${ttsConfig.thirdParty.rate.toString()}`;
    
    
    try {
        // 发送 GET 请求
        const response = await fetch(fullUrl, {
            method: 'GET',
            signal: abortSignal
        });

        // 检查响应状态
        if (!response.ok) {
            throw new Error(`请求失败：${response.status} ${response.statusText}`);
        }

        // 处理音频二进制流
        const audioBlob = await response.blob();
        
        return audioBlob;

    } catch (error) {
        // 只显示一次错误
        if (!ttsErrorShown) {
            ttsErrorShown = true;
            console.error('❌ TTS请求失败:', error.message);
            alert('TTS请求失败，请检查本地TTS服务器是否正常运行');
        }
        return null;
    }
}

// ---------- 辅助：在后台加载多个页面的语音 ----------
async function loadAudioForPages(pageNumbers) {
    console.log('🔄 开始在后台加载多个页面的语音...');
    console.log('📚 要加载的页码:', pageNumbers);
    
    // 重置错误标志
    ttsErrorShown = false;
    
    // 创建AbortController用于取消请求
    const controller = new AbortController();
    const signal = controller.signal;
    
    // 清空动态播放列表
    dynamicPlayList = [];
    currentPlayIndex = -1;
    
    // 存储加载任务
    const loadTasks = [];
    
    // 对每个页码创建加载任务
    for (const pageNumber of pageNumbers) {
        const task = async () => {
            // 检查是否已经有错误
            if (ttsErrorShown) {
                return null;
            }
            
            console.log(`📄 开始加载页码 ${pageNumber} 的语音...`);
            
            // 提取该页码的文本
            const { text: pageText } = getPdfPageText(pageNumber);
            
            if (!pageText) {
                console.warn(`⚠️ 页码 ${pageNumber} 没有可播放的文本`);
                return null;
            }
            
            console.log(`📝 页码 ${pageNumber} 的文本长度:`, pageText.length);
            
            // 获取音频Blob
            const audioBlob = await sendTTSRequest(pageText, signal);
            
            if (!audioBlob) {
                console.error(`❌ 未能获取页码 ${pageNumber} 的音频数据`);
                // 取消所有剩余请求
                controller.abort();
                return null;
            }
            
            // 创建临时URL
            const audioUrl = URL.createObjectURL(audioBlob);
            console.log(`🔗 页码 ${pageNumber} 的音频临时URL:`, audioUrl);
            
            // 创建播放项
            const playItem = {
                pageNumber,
                audioBlob,
                audioUrl,
                text: pageText
            };
            
            // 添加到动态播放列表
            dynamicPlayList.push(playItem);
            console.log(`✅ 页码 ${pageNumber} 的语音加载完成`);
            
            return playItem;
        };
        
        loadTasks.push(task());
    }
    
    // 等待所有加载任务完成
    const results = await Promise.all(loadTasks);
    
    // 过滤掉失败的加载
    const successfulResults = results.filter(item => item !== null);
    
    console.log(`✅ 后台加载语音完成，成功加载 ${successfulResults.length} 个页面`);
    console.log('🎵 动态播放列表:', dynamicPlayList);
    
    // 按页码排序
    dynamicPlayList.sort((a, b) => a.pageNumber - b.pageNumber);
    console.log('🎵 排序后的动态播放列表:', dynamicPlayList);
    
    return dynamicPlayList;
}

// ---------- 核心：更新播放按钮状态 ----------
function updatePlayButtonState() {
    // 调试：打印更新按钮状态时的isPlaying值
    console.log('🔍 更新按钮状态，isPlaying:', isPlaying);
    
    // 更新PDF播放按钮
    const pdfPlayButtons = document.querySelectorAll('.orca-pdf-play-btn');
    console.log('🔍 找到PDF播放按钮数量:', pdfPlayButtons.length);
    pdfPlayButtons.forEach(button => {
        if (isPlaying) {
            button.innerHTML = '<span>⏸️</span>';
            console.log('🔍 设置PDF按钮为暂停图标');
        } else {
            button.innerHTML = '<span>▶️</span>';
            console.log('🔍 设置PDF按钮为播放图标');
        }
    });
    
    // 更新EPUB播放按钮
    const epubPlayButtons = document.querySelectorAll('.orca-epub-play-btn');
    console.log('🔍 找到EPUB播放按钮数量:', epubPlayButtons.length);
    epubPlayButtons.forEach(button => {
        if (isPlaying) {
            button.innerHTML = '<span>⏸️</span> 暂停';
            console.log('🔍 设置EPUB按钮为暂停图标');
        } else {
            button.innerHTML = '<span>▶️</span> 播放';
            console.log('🔍 设置EPUB按钮为播放图标');
        }
    });
}

// ---------- 核心：保存音频功能 ----------
async function savePdfAudio() {
    console.log('💾 准备保存PDF音频');
    
    // 获取页面文本
    const pageText = getPdfPageText();
    if (!pageText) {
        console.warn('⚠️ 没有可保存的文本');
        alert('当前页面没有可保存的文本');
        return;
    }
    
    console.log('📝 准备保存文本，长度:', pageText.length);
    
    // 构建本地TTS服务器请求URL
    const params = new URLSearchParams({
        key: ttsConfig.localTtsKey,
        text: pageText,
        format: 'mp3',
        speed: ttsConfig.rate.toString()
    });
    
    const ttsUrl = `${ttsConfig.localTtsUrl}?${params.toString()}`;
    console.log('🌐 本地TTS服务器请求URL:', ttsUrl);
    
    console.log('🎤 开始使用本地TTS服务器生成音频...');
    
    try {
        // 发送请求获取音频
        const response = await fetch(ttsUrl);
        
        if (!response.ok) {
            console.error('❌ 音频生成失败，状态码:', response.status);
            alert('音频生成失败，请检查本地TTS服务器状态');
            return;
        }
        
        // 获取音频数据
        const audioBlob = await response.blob();
        console.log('✅ 音频生成成功，大小:', audioBlob.size, 'bytes');
        
        // 创建下载链接
        const downloadUrl = URL.createObjectURL(audioBlob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `pdf-audio-${new Date().getTime()}.mp3`;
        
        // 触发下载
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 释放URL对象
        URL.revokeObjectURL(downloadUrl);
        
        console.log('💾 PDF音频保存成功');
        alert('音频保存成功！\n\n文件已下载到您的下载文件夹。');
        
    } catch (error) {
        console.error('❌ 保存音频时发生错误:', error);
        alert('保存音频时发生错误，请检查本地TTS服务器状态');
    }
}

// ---------- 核心：向PDF工具栏添加播放按钮 ----------
function addPlayButtonToPdfToolbar() {
    console.log('🔧 准备向PDF工具栏添加播放和停止按钮');
    
    // 查找所有.orca-hideable元素
    const hideableElements = document.querySelectorAll('.orca-hideable');
    
    hideableElements.forEach(hideable => {
        // 查找PDF容器
        const pdfContainer = hideable.querySelector('.orca-repr-pdf-container.orca-maximized');
        if (!pdfContainer) return;
        
        // 查找PDF工具栏
        const toolbars = pdfContainer.querySelectorAll('.orca-pdf-toolbar');
        toolbars.forEach(toolbar => {
            // 检查是否已添加过播放控制元素
            if (document.querySelector('.orca-pdf-draggable-buttons')) return;
            
            // 创建可拖动的悬浮按钮容器（外轮廓作为进度条）
            const draggableButtonContainer = document.createElement('div');
            draggableButtonContainer.className = 'orca-pdf-draggable-buttons';
            
            // 获取PDF容器的位置信息，用于初始化悬浮按钮的位置
            const pdfRect = pdfContainer.getBoundingClientRect();
            
            draggableButtonContainer.style.cssText = `
                position: fixed;
                top: ${pdfRect.top + 50}px;
                right: ${window.innerWidth - pdfRect.right + 20}px;
                width: 40px;
                height: 80px;
                background: #ffffff;
                border: 3px solid #e0e0e0;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                display: flex;
                flex-direction: column;
                z-index: 1001;
                cursor: move;
                overflow: visible;
                user-select: none;
                transition: border-color 0.3s ease;
            `;
            
            // 创建进度条效果（使用伪元素实现外轮廓进度条）
            const progressOutline = document.createElement('div');
            progressOutline.className = 'orca-pdf-progress-outline';
            progressOutline.style.cssText = `
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                background: linear-gradient(to bottom, #e0e0e0 0%, #e0e0e0 100%);
                border-radius: 14px;
                z-index: -1;
                transition: background-position 0.3s ease;
                pointer-events: none;
            `;
            draggableButtonContainer.appendChild(progressOutline);
            
            // 保存进度条元素引用，用于更新进度
            window.orcaPdfProgressOutline = progressOutline;
            
            // 创建播放按钮（上半部分）
            const playBtn = document.createElement('button');
            playBtn.className = 'orca-pdf-play-btn';
            playBtn.innerHTML = '<span>▶️</span>';
            playBtn.style.cssText = `
                flex: 1; border: none; border-bottom: 1px solid #e0e0e0;
                background: #f5f7fa; cursor: pointer;
                font-size: 16px; display: flex;
                justify-content: center;
                align-items: center;
                transition: background 0.2s ease;
                border-top-left-radius: 12px;
                border-top-right-radius: 12px;
            `;
            playBtn.onmouseover = () => playBtn.style.background = '#e8f4ff';
            playBtn.onmouseout = () => playBtn.style.background = '#f5f7fa';

            // 播放按钮点击事件
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡，避免触发拖动
                console.log('🔘 播放按钮被点击');
                // 直接调用playPdfText函数，让它处理所有状态逻辑
                playPdfText();
            });

            // 创建停止按钮（下半部分）
            const stopBtn = document.createElement('button');
            stopBtn.className = 'orca-pdf-stop-btn';
            stopBtn.innerHTML = '<span>⏹️</span>';
            stopBtn.style.cssText = `
                flex: 1; border: none;
                background: #f5f7fa; cursor: pointer;
                font-size: 16px; display: flex;
                justify-content: center;
                align-items: center;
                transition: background 0.2s ease;
                border-bottom-left-radius: 12px;
                border-bottom-right-radius: 12px;
            `;
            stopBtn.onmouseover = () => stopBtn.style.background = '#e8f4ff';
            stopBtn.onmouseout = () => stopBtn.style.background = '#f5f7fa';

            // 停止按钮点击事件
            stopBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡，避免触发拖动
                stopPdfPlayback();
            });

            // 将按钮添加到可拖动容器
            draggableButtonContainer.appendChild(playBtn);
            draggableButtonContainer.appendChild(stopBtn);
            
            // 将可拖动按钮容器添加到body元素中，避免影响PDF容器的层叠上下文
            document.body.appendChild(draggableButtonContainer);
            console.log('✅ PDF播放和停止按钮已添加为可拖动的悬浮按钮，带有红色进度条');
            
            // 监听PDF容器的位置变化，更新悬浮按钮的位置
            const observer = new MutationObserver(() => {
                const pdfRect = pdfContainer.getBoundingClientRect();
                draggableButtonContainer.style.top = `${pdfRect.top + 50}px`;
                draggableButtonContainer.style.right = `${window.innerWidth - pdfRect.right + 20}px`;
            });
            
            observer.observe(pdfContainer, { attributes: true, subtree: true });
            
            // 实现拖动功能
            let isDragging = false;
            let startX, startY, offsetX, offsetY;
            
            draggableButtonContainer.addEventListener('mousedown', (e) => {
                // 只有左键点击才触发拖动
                if (e.button !== 0) return;
                
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                // 正确计算初始偏移量，考虑right属性
                if (draggableButtonContainer.style.right !== 'auto' && !draggableButtonContainer.style.left) {
                    // 如果设置了right但没有设置left，计算left值
                    const right = parseInt(draggableButtonContainer.style.right) || 0;
                    const containerRect = pdfContainer.getBoundingClientRect();
                    offsetX = containerRect.right - draggableButtonContainer.offsetWidth - right;
                } else {
                    // 否则使用left值
                    offsetX = parseInt(draggableButtonContainer.style.left) || 0;
                }
                
                offsetY = parseInt(draggableButtonContainer.style.top) || 0;
                draggableButtonContainer.style.cursor = 'grabbing';
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                // 计算新位置
                let newLeft = offsetX + dx;
                let newTop = offsetY + dy;
                
                // 获取PDF容器以限制拖动范围
                const containerRect = pdfContainer.getBoundingClientRect();
                
                // 边界检查（基于视口坐标）
                const maxLeft = containerRect.right - draggableButtonContainer.offsetWidth;
                const maxTop = containerRect.bottom - draggableButtonContainer.offsetHeight;
                
                newLeft = Math.max(containerRect.left, Math.min(newLeft, maxLeft));
                newTop = Math.max(containerRect.top, Math.min(newTop, maxTop));
                
                draggableButtonContainer.style.left = newLeft + 'px';
                draggableButtonContainer.style.top = newTop + 'px';
                // 对于fixed定位，我们不需要设置right属性
                draggableButtonContainer.style.right = 'auto';
            });
            
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    draggableButtonContainer.style.cursor = 'move';
                }
            });
            
            // 触摸设备支持
            draggableButtonContainer.addEventListener('touchstart', (e) => {
                isDragging = true;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                
                // 正确计算初始偏移量，考虑right属性
                if (draggableButtonContainer.style.right !== 'auto' && !draggableButtonContainer.style.left) {
                    // 如果设置了right但没有设置left，计算left值
                    const right = parseInt(draggableButtonContainer.style.right) || 0;
                    const containerRect = pdfContainer.getBoundingClientRect();
                    offsetX = containerRect.right - draggableButtonContainer.offsetWidth - right;
                } else {
                    // 否则使用offsetLeft
                    offsetX = draggableButtonContainer.offsetLeft;
                }
                
                offsetY = draggableButtonContainer.offsetTop;
                draggableButtonContainer.style.cursor = 'grabbing';
                e.preventDefault();
            });
            
            document.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                
                const touch = e.touches[0];
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                
                // 计算新位置
                let newLeft = offsetX + dx;
                let newTop = offsetY + dy;
                
                // 获取PDF容器以限制拖动范围
                const containerRect = pdfContainer.getBoundingClientRect();
                
                // 边界检查
                const maxLeft = containerRect.width - draggableButtonContainer.offsetWidth;
                const maxTop = containerRect.height - draggableButtonContainer.offsetHeight;
                
                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));
                
                draggableButtonContainer.style.left = newLeft + 'px';
                draggableButtonContainer.style.top = newTop + 'px';
                e.preventDefault();
            });
            
            document.addEventListener('touchend', () => {
                if (isDragging) {
                    isDragging = false;
                    draggableButtonContainer.style.cursor = 'move';
                }
            });
        });
    });
}

// ---------- 核心：向EPUB工具栏添加播放和停止按钮 ----------
function addPlayButtonToEpubToolbar() {
    console.log('🔧 准备向EPUB工具栏添加播放和停止按钮');
    
    // 查找所有.orca-hideable元素
    const hideableElements = document.querySelectorAll('.orca-hideable');
    
    hideableElements.forEach(hideable => {
        // 查找EPUB容器
        const epubContainer = hideable.querySelector('.orca-repr-epub-container.orca-maximized');
        if (!epubContainer) return;
        
        // 查找EPUB阅读区域
        const epubReaderArea = epubContainer.querySelector('.orca-epub-reader-area');
        if (!epubReaderArea) {
            console.warn('⚠️ 未找到EPUB阅读区域');
            return;
        }
        
        // 查找EPUB工具栏
        let epubToolbar = epubReaderArea.querySelector('.orca-epub-toolbar');
        if (!epubToolbar) {
            // 如果没有工具栏，创建一个
            epubToolbar = document.createElement('div');
            epubToolbar.className = 'orca-epub-toolbar';
            epubToolbar.style.cssText = `
                display: flex;
                align-items: center;
                padding: 8px;
                background: #f5f7fa;
                border-bottom: 1px solid #e1e5e9;
                position: relative;
            `;
            
            // 将工具栏添加到EPUB阅读区域的顶部
            epubReaderArea.insertBefore(epubToolbar, epubReaderArea.firstChild);
        }
        
        // 检查是否已添加过播放控制元素
        if (epubContainer.querySelector('.orca-epub-playback-controls')) return;

        // 创建播放控制容器（独立元素）
        const playbackControls = document.createElement('div');
        playbackControls.className = 'orca-epub-playback-controls';
        playbackControls.style.cssText = `
            position: absolute;
            top: 100%;
            right: 0;
            display: flex;
            align-items: center;
            width: 100%;
            z-index: 1000;
        `;

        // 创建播放进度条容器
        const progressContainer = document.createElement('div');
        progressContainer.className = 'orca-epub-progress-container';
        progressContainer.style.cssText = `
            flex: 1; height: 3px; background: #e1e5e9; margin-right: 16px;
        `;
        
        // 创建播放进度条
        const progressBar = document.createElement('div');
        progressBar.className = 'orca-epub-progress-bar';
        progressBar.style.cssText = `
            width: 0%; height: 100%; background: #ff0000; transition: width 0.3s ease;
        `;
        
        // 将进度条添加到容器
        progressContainer.appendChild(progressBar);
        
        // 创建按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'orca-epub-button-container';
        buttonContainer.style.cssText = `
            display: flex; justify-content: flex-end; align-items: center;
        `;
        
        // 创建播放按钮
        const playBtn = document.createElement('button');
        playBtn.className = 'orca-epub-play-btn';
        playBtn.innerHTML = '<span>▶️</span> 播放';
        playBtn.style.cssText = `
            margin-right: 8px; padding: 4px 8px; border: none;
            border-radius: 4px; background: #f5f7fa; cursor: pointer;
            font-size: 12px; height: 28px; line-height: 1;
            display: inline-block;
        `;
        playBtn.onmouseover = () => playBtn.style.background = '#e8f4ff';
        playBtn.onmouseout = () => playBtn.style.background = '#f5f7fa';

        // 播放按钮点击事件
        playBtn.addEventListener('click', () => {
            console.log('🔘 EPUB播放按钮被点击');
            // 直接调用playPdfText函数，让它处理所有状态逻辑
            playPdfText();
        });

        // 创建停止按钮
        const stopBtn = document.createElement('button');
        stopBtn.className = 'orca-epub-stop-btn';
        stopBtn.innerHTML = '<span>⏹️</span> 停止';
        stopBtn.style.cssText = `
            margin-right: 8px; padding: 4px 8px; border: none;
            border-radius: 4px; background: #f5f7fa; cursor: pointer;
            font-size: 12px; height: 28px; line-height: 1;
            display: inline-block;
        `;
        stopBtn.onmouseover = () => stopBtn.style.background = '#e8f4ff';
        stopBtn.onmouseout = () => stopBtn.style.background = '#f5f7fa';

        // 停止按钮点击事件
        stopBtn.addEventListener('click', stopPdfPlayback);

        // 将按钮添加到按钮容器
        buttonContainer.appendChild(playBtn);
        buttonContainer.appendChild(stopBtn);
        
        // 将进度条和按钮容器添加到播放控制容器
        playbackControls.appendChild(progressContainer);
        playbackControls.appendChild(buttonContainer);
        
        // 确保工具栏有相对定位，以便播放控制容器可以绝对定位
        epubToolbar.style.position = 'relative';
        
        // 将播放控制容器添加到EPUB容器中
        epubContainer.appendChild(playbackControls);
        console.log('✅ EPUB播放和停止按钮已添加为独立元素，带有红色进度条，定位在工具栏下边缘');
    });
}

// ---------- 核心：监听DOM变化，动态添加按钮 ----------
function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // 检测PDF工具栏
                        if (node.classList.contains('orca-pdf-toolbar')) {
                            addPlayButtonToPdfToolbar();
                        }
                        const pdfToolbars = node.querySelectorAll('.orca-pdf-toolbar');
                        if (pdfToolbars.length > 0) {
                            addPlayButtonToPdfToolbar();
                        }
                        
                        // 检测EPUB工具栏
                        if (node.classList.contains('orca-epub-toolbar')) {
                            addPlayButtonToEpubToolbar();
                        }
                        const epubToolbars = node.querySelectorAll('.orca-epub-toolbar');
                        if (epubToolbars.length > 0) {
                            addPlayButtonToEpubToolbar();
                        }
                        
                        // 检测文本菜单
                        if (node.classList.contains('orca-pdf-text-menu') || node.classList.contains('orca-epub-text-menu')) {
                            addPlayFromHereMenuItem(node);
                        }
                        const textMenus = node.querySelectorAll('.orca-pdf-text-menu, .orca-epub-text-menu');
                        if (textMenus.length > 0) {
                            textMenus.forEach(menu => addPlayFromHereMenuItem(menu));
                        }
                        
                        // 检测PDF容器
                        if (node.classList.contains('orca-repr-pdf-container')) {
                            console.log('📄 检测到PDF容器');
                            addPlayButtonToPdfToolbar();
                        }
                        
                        // 检测EPUB容器
                        if (node.classList.contains('orca-repr-epub-container')) {
                            console.log('📖 检测到EPUB容器');
                            addPlayButtonToEpubToolbar();
                        }
                    }
                });
            }
            
            // 检测属性变化，确保菜单显示时能被正确处理
            if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
                const target = mutation.target;
                // 检查是否是文本菜单
                if (target.classList.contains('orca-pdf-text-menu') || target.classList.contains('orca-epub-text-menu')) {
                    addPlayFromHereMenuItem(target);
                }
            }
        });
        
        // 额外检查：定期搜索页面上的文本菜单，确保没有遗漏
        const allTextMenus = document.querySelectorAll('.orca-pdf-text-menu, .orca-epub-text-menu');
        if (allTextMenus.length > 0) {
            allTextMenus.forEach(menu => addPlayFromHereMenuItem(menu));
        }
    });

    observer.observe(document.body, {
        childList: true,
        attributes: true,
        subtree: true
    });

    console.log('🔍 DOM变化监听器已初始化');
}

// ---------- 辅助：在文本菜单中添加"从此播放"菜单项 ----------
function addPlayFromHereMenuItem(menu) {
    console.log('🔧 准备在文本菜单中添加"从此播放"菜单项');
    
    // 检查是否已经添加过"从此播放"菜单项
    if (menu.querySelector('.orca-menu-play-from-here')) {
        return;
    }
    
    // 创建分隔线
    const separator = document.createElement('div');
    separator.className = 'orca-menu-separator';
    
    // 创建"从此播放"菜单项
    const playFromHereItem = document.createElement('div');
    playFromHereItem.className = 'orca-menu-text orca-menu-play-from-here';
    playFromHereItem.innerHTML = '<div class="orca-menu-text-text">从此播放</div>';
    
    // 添加点击事件
    playFromHereItem.addEventListener('click', playFromSelectedText);
    
    // 查找复制文本菜单项
    const copyTextItem = menu.querySelector('.orca-menu-text');
    if (copyTextItem) {
        // 如果找到复制文本菜单项，在其后面添加
        copyTextItem.parentNode.insertBefore(separator, copyTextItem.nextSibling);
        copyTextItem.parentNode.insertBefore(playFromHereItem, separator.nextSibling);
        console.log('✅ 已在复制文本菜单项后添加"从此播放"菜单项');
    } else {
        // 如果没有找到复制文本菜单项，在菜单末尾添加
        menu.appendChild(separator);
        menu.appendChild(playFromHereItem);
        console.log('✅ 已在菜单末尾添加"从此播放"菜单项');
    }
}

// ---------- 核心：从选中的文本开始播放 ----------
async function playFromSelectedText() {
    console.log('▶️ 准备从选中的文本开始播放');
    
    // 获取当前页码
    let currentPageNumber = 1;
    try {
        // 查找页码输入框
        const pageNumInput = document.querySelector('.orca-pdf-pagenum-input input');
        if (pageNumInput && pageNumInput.value) {
            currentPageNumber = parseInt(pageNumInput.value, 10);
        }
    } catch (e) {
        console.warn('⚠️ 获取页码时出错:', e);
        currentPageNumber = 1;
    }
    
    // 获取选中的文本（支持iframe中的选择）
    let selectedText = '';
    
    // 尝试从主窗口获取
    selectedText = window.getSelection().toString().trim();
    
    // 如果主窗口没有选中的文本，尝试从iframe获取
    if (!selectedText) {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const iframeWindow = iframe.contentWindow || iframe.contentDocument.defaultView;
                if (iframeWindow) {
                    const iframeSelection = iframeWindow.getSelection().toString().trim();
                    if (iframeSelection) {
                        selectedText = iframeSelection;
                        break;
                    }
                }
            } catch (e) {
                console.warn('⚠️ 无法访问iframe中的选择:', e);
            }
        }
    }
    
    if (!selectedText) {
        console.warn('⚠️ 未选中任何文本');
        alert('请先选择要播放的文本');
        return;
    }
    
    console.log('📝 选中的文本:', selectedText);
    
    // 停止之前的播放
    stopPdfPlayback();
    
    // 获取页面文本和片段
    const { text: pageText, segments: textSegments } = getPdfPageText();
    if (!pageText || textSegments.length === 0) {
        console.warn('⚠️ 没有可播放的文本');
        alert('当前页面没有可播放的文本');
        return;
    }
    
    // 查找选中文本在哪个片段中
    let startSegmentIndex = 0;
    let found = false;
    
    for (let i = 0; i < textSegments.length; i++) {
        const segment = textSegments[i];
        if (segment.text.includes(selectedText) || selectedText.includes(segment.text)) {
            startSegmentIndex = i;
            found = true;
            break;
        }
    }
    
    if (!found) {
        console.warn('⚠️ 选中的文本不在当前页面中');
        alert('选中的文本不在当前页面中');
        return;
    }
    
    console.log(`🎯 从第 ${startSegmentIndex + 1} 个片段开始播放`);
    
    // 获取插件设置
    const pluginName = window.pluginName;
    const settings = orca?.state?.plugins?.[pluginName]?.settings;
    const ttsService = settings?.ttsService || 'system';
    
    // 更新TTS配置
    if (settings) {
        ttsConfig.rate = settings.ttsRate || 1.5;
        ttsConfig.pitch = settings.ttsPitch || 1;
    }
    
    // 开始播放
    isPlaying = true;
    updatePlayButtonState();
    
    if (ttsService === '系统语音') {
        console.log('🎤 开始使用系统语音播放选中的文本');
        // 启动高亮显示，从选中的片段开始
        startHighlighting(textSegments, startSegmentIndex);
        // 从选中的片段开始播放
        playTextSegments(textSegments, startSegmentIndex);
    } else if (ttsService === '第三方') {
        console.log('🎤 开始使用第三方语音服务播放选中的文本');
        
        // 清空动态播放列表
        dynamicPlayList = [];
        currentPlayIndex = -1;
        
        // 获取当前页面的所有文本片段和已处理的句子，存储起来用于整个播放过程的高亮
        const { segments, sentences, text: processedText } = getPdfPageText();
        currentPageSegments = segments;
        
        // 构建从选中片段开始的文本
        let textFromSelection = '';
        for (let i = startSegmentIndex; i < segments.length; i++) {
            textFromSelection += segments[i].text + ' ';
        }
        // 对文本进行去空格处理
        textFromSelection = textFromSelection.trim().replace(/\s+/g, ' ');
        
        // 按句号拆分文本
        const sentencesFromSelection = textFromSelection.split('。').filter(sentence => sentence.trim().length > 0);
        
        if (sentencesFromSelection.length === 0) {
            console.warn('⚠️ 没有可播放的句子');
            alert('当前选择没有可播放的文本');
            isPlaying = false;
            updatePlayButtonState();
            return;
        }
        
        // 设置为动态播放模式
        isDynamicPlayMode = true;
        
        // 存储所有音频Blob
        const audioBlobs = [];
        
        // 为每个句子生成语音
        for (let i = 0; i < sentencesFromSelection.length; i++) {
            const sentence = sentencesFromSelection[i].trim();
            
            if (sentence.length === 0) {
                continue;
            }
            
            // 生成语音
            const audioBlob = await sendTTSRequest(sentence);
            
            if (audioBlob) {
                // 添加到音频Blob数组
                audioBlobs.push(audioBlob);
            }
        }
        
        if (audioBlobs.length === 0) {
            console.warn('⚠️ 没有可播放的句子');
            alert('当前页面没有可播放的文本');
            isPlaying = false;
            updatePlayButtonState();
            return;
        }
        
        // 合并音频Blob
        const mergedAudioBlob = await mergeAudioBlobs(audioBlobs);
        
        if (!mergedAudioBlob) {
            console.error('❌ 合并音频Blob失败');
            alert('合并音频失败，请重试');
            isPlaying = false;
            updatePlayButtonState();
            return;
        }
        
        console.log(`✅ 音频Blob合并完成，大小:`, mergedAudioBlob.size, 'bytes');
        
        // 创建合并后的音频URL
        const mergedAudioUrl = URL.createObjectURL(mergedAudioBlob);
        
        // 创建播放项
        const playItem = {
            sentence: processedText,
            audioBlob: mergedAudioBlob,
            audioUrl: mergedAudioUrl,
            text: processedText,
            currentPageNumber: currentPageNumber
        };
        
        // 添加到动态播放列表
        dynamicPlayList.push(playItem);
        
        // 启动高亮显示，从选中的片段开始
        startHighlighting(currentPageSegments, startSegmentIndex);
        
        // 开始播放合并后的音频
        currentPlayIndex = 0;
        playCurrentSentenceInDynamicList(currentPageNumber);
    }
}

// ---------- 插件初始化函数 ----------
function initPlugin() {
    console.log('🚀 F-yuedu 插件初始化中...');
    
    // 立即添加播放按钮
    addPlayButtonToPdfToolbar();
    addPlayButtonToEpubToolbar();
    
    // 初始化DOM变化监听器，动态添加按钮
    initMutationObserver();
    
    console.log('✅ F-yuedu 插件初始化完成');
}

// ---------- 插件入口点 ----------
// 标准 Orca 插件格式：使用 export 导出函数

// 必须的 load 函数
// Orca 插件系统会调用此函数来加载插件
export async function load(pluginName) {
    console.log('📦 加载 F-yuedu 插件:', pluginName);
    
    // 存储插件名称
    window.pluginName = pluginName;
    
    // 设置插件设置架构
    await orca.plugins.setSettingsSchema(pluginName, {
        ttsService: {
            label: "语音服务",
            description: "选择使用的语音合成服务：系统语音、第三方",
            type: "string",
            defaultValue: "系统语音",
            enum: ["系统语音", "第三方"]
        },
        ttsRate: {
            label: "语速",
            description: "语音播放的速度，0.1~10，1为默认",
            type: "number",
            defaultValue: 1.5,
            minimum: 0.1,
            maximum: 10
        },
        ttsPitch: {
            label: "音调",
            description: "语音的音调，0~2，1为默认",
            type: "number",
            defaultValue: 1,
            minimum: 0,
            maximum: 2
        }
    });
    
    // 初始化插件
    initPlugin();
    
    console.log('✅ F-yuedu 插件加载完成');
    return true;
}

// 必须的 unload 函数
// Orca 插件系统会调用此函数来卸载插件
export async function unload() {
    console.log('👋 卸载 F-yuedu 插件');
    
    // 停止语音播放
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    
    // 清理变量
    isPlaying = false;
    currentPageElement = null;
    
    console.log('✅ F-yuedu 插件卸载完成');
}

// 兼容浏览器环境
if (typeof window !== 'undefined') {
    // 暴露插件函数到全局作用域
    window.FYueduPlugin = {
        load,
        unload
    };
    
    // 立即执行初始化（如果在浏览器环境中，且不是通过 Orca 插件系统加载）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlugin);
    } else {
        // 只有在非插件系统环境中才自动初始化
        if (typeof orca === 'undefined' || !orca.plugins) {
            initPlugin();
        }
    }
}

// 兼容 CommonJS 环境（如果需要）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        load,
        unload
    };
    
    // 也支持默认导出
    module.exports.default = {
        load,
        unload
    };
}