# 装置识别组件

MediaPipe Tasks Vision 0.10.21 的 JavaScript 模块、WebAssembly 和 Hand Landmarker 复用了本机原项目“Fog Mirror · 拍摄辅助版”的已随附依赖，许可见 LICENSE。多人姿态和面部表情使用 Google 官方预训练模型，网页无需把摄像头图像传给远端服务。

- [Google MediaPipe 主仓库与 Apache 2.0 许可](https://github.com/google-ai-edge/mediapipe)
- [Hand Landmarker 开发文档](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Face Landmarker 开发文档](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [模型](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
- [Pose Landmarker 开发文档](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js) · [模型](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task)
- [摄像头与麦克风访问](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) · [Web Audio 音量采样](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteTimeDomainData)

雾面沿用 Fog Mirror 的清晰镜像、独立雾面遮罩和食指落笔方案。麦克风以背景音量校准后检测持续较强气流声，在嘈杂现场也可能受说话声影响。

两人站位的四张动作参考图为本项目原创插画。多人队伍使用按实际人数绘制的动作与站位指南。拍照动作参考了 [Photo Pose Ideas](https://www.wimouniv.com/en/photo-pose) 和 [Photo Booth Poses](https://thephotoboothapp.com/photo-booth-poses/)。没有使用示例录屏内的第三方动画及配乐。
