// wwwroot/js/music-player.js

window.MusicPlayer = {
    ensure: function () {
        if (!window._globalBgm) {
            const a = new Audio();
            a.id = 'globalBgm';
            a.preload = 'auto';
            a.loop = true; // 기본 무한 반복
            a.style.display = 'none';
            document.body.appendChild(a);
            window._globalBgm = a;
            window._currentTitle = '';
            window._isVideo = false;
        }
    },

    _ensureVideoContainer: function () {
        if (!window._globalVideoContainer) {
            const container = document.createElement('div');
            container.id = 'globalVideoContainer';
            container.style.position = 'fixed';
            container.style.right = '12px';
            container.style.bottom = '12px';
            container.style.width = '40vw';
            container.style.maxWidth = '720px';
            container.style.maxHeight = '60vh';
            container.style.zIndex = '2000';
            container.style.background = 'rgba(0,0,0,0.6)';
            container.style.borderRadius = '8px';
            container.style.overflow = 'hidden';
            container.style.display = 'none';
            container.style.padding = '6px';
            container.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';

            const video = document.createElement('video');
            video.id = 'globalVideo';
            video.style.width = '100%';
            video.style.height = '100%';
            video.controls = true;
            video.preload = 'metadata';

            // 클릭 시 재생/일시정지 토글 (또는 닫기 별도 제공 가능)
            video.addEventListener('click', function () {
                if (video.paused) video.play().catch(() => {});
                else video.pause();
            });

            // 닫기 버튼
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '✕';
            closeBtn.title = 'Close video';
            closeBtn.style.position = 'absolute';
            closeBtn.style.top = '6px';
            closeBtn.style.right = '8px';
            closeBtn.style.background = 'rgba(0,0,0,0.4)';
            closeBtn.style.color = '#fff';
            closeBtn.style.border = 'none';
            closeBtn.style.borderRadius = '4px';
            closeBtn.style.padding = '2px 6px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                video.pause();
                container.style.display = 'none';
                video.src = '';
                window._isVideo = false;
            });

            container.appendChild(video);
            container.appendChild(closeBtn);
            document.body.appendChild(container);

            window._globalVideoContainer = container;
            window._globalVideo = video;
        }
    },

    setLoop: function (loop) {
        this.ensure();
        if (window._globalBgm) window._globalBgm.loop = !!loop;
        if (window._globalVideo) window._globalVideo.loop = !!loop;
    },

    play: async function (url, title) {
        this.ensure();

        const fullUrl = new URL(url, window.location.origin).toString();
        window._currentTitle = title || '';

        // 파일 확장자 판별 (간단 검사)
        const path = new URL(fullUrl).pathname.toLowerCase();
        const videoExts = ['.mp4', '.webm', '.ogg', '.m4v', '.mov', '.avi', '.mkv'];
        const isVideo = videoExts.some(ext => path.endsWith(ext));

        if (isVideo) {
            // 비디오 재생 로직
            this._ensureVideoContainer();
            const v = window._globalVideo;
            const container = window._globalVideoContainer;

            if (v.src !== fullUrl) {
                v.src = fullUrl;
            }

            try {
                await v.play();
                container.style.display = 'block';
                window._isVideo = true;
                return true;
            } catch (e) {
                console.error('Video playback failed:', e);
                return false;
            }
        } else {
            // 오디오 재생 기존 로직
            const a = window._globalBgm;
            if (a.src !== fullUrl) {
                a.src = fullUrl;
            }
            try {
                await a.play();
                window._isVideo = false;
                // 숨겨진 비디오가 있으면 중지
                if (window._globalVideo && !window._globalVideo.paused) {
                    window._globalVideo.pause();
                    if (window._globalVideoContainer) {
                        window._globalVideoContainer.style.display = 'none';
                        window._globalVideo.src = '';
                    }
                }
                return true;
            } catch (e) {
                console.error('Audio playback failed:', e);
                return false;
            }
        }
    },

    stop: function () {
        if (window._globalBgm) {
            window._globalBgm.pause();
            // keep src if wanted
        }
        if (window._globalVideo) {
            try {
                window._globalVideo.pause();
                window._globalVideo.src = '';
            } catch {}
        }
        if (window._globalVideoContainer) {
            window._globalVideoContainer.style.display = 'none';
        }
        window._isVideo = false;
        return true;
    },

    current: function () {
        this.ensure();
        const src = (window._isVideo && window._globalVideo) ? (window._globalVideo.currentSrc || window._globalVideo.src) : (window._globalBgm && window._globalBgm.src ? window._globalBgm.src : '');
        return { title: window._currentTitle || '', src: src || '', isVideo: !!window._isVideo };
    },

    download: function (url, filename) {
        const a = document.createElement('a');
        a.href = url;
        if (filename) a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 0);
        return true;
    }
};
