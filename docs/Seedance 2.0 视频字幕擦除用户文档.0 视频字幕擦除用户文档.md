【申请请填写客户名称】Seedance 2.0 视频字幕擦除用户文档
使用 Seedance 2.0 / Seedance 2.0 fast 模型生成的视频可能包含字幕，本文为您介绍如何通过 API 对视频进行字幕擦除。
字幕擦除为方舟平台提供的免费功能，暂不收费。
如有问题优先看下方常见问题自查。
使用流程
暂时无法在飞书文档外展示此内容
流程简介
字幕擦除任务接口是异步接口，流程如下：
1. 发起字幕擦除任务
2. 定时使用查询接口查询视频生成任务状态
  1. 任务 running，过段时间再查询任务状态
  2. 任务 completed，返回视频URL，在24小时内下载生成的视频文件
调用示例
1. 发起字幕擦除任务
video_url 即待擦除字幕的视频 URL，从方舟查询 Seedance 2.0 视频生成任务 API返回的content.video_url 字段获取。
注意：仅支持使用 方舟Seedance 2.0 生成的原始 URL，转存后无效。原始 URL 存在 24h 有效期，请及时处理。
curl https://mediakit.cn-beijing.volces.com/api/v1/ark-tools/ark-erase-video-subtitle-pro \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
  -d '{
    "video_url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-2-0/02177599245546000000000000000000000ffffac15f56e704723.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=YOUR_ACCESS_KEY_ID%2F20260412%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260412T112031Z&X-Tos-Expires=86400&X-Tos-Signature=YOUR_SIGNATURE&X-Tos-SignedHeaders=host"
}'
成功后返回以下信息，复制 task_id 备用。
{
"success":true,
"task_id":"amk-tool-ark-erase-video-subtitle-pro-65295360258",
"request_id":"20260413115555A9B605F29A01D0ADE980"
}
2. 使用您的 task_id 查询字幕擦除任务结果
curl -X GET https://mediakit.cn-beijing.volces.com/api/v1/ark-tasks/amk-tool-ark-erase-video-subtitle-pro-65295360258 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
任务执行成功后，可通过result.video_url 获取擦除字幕后的视频链接。
{
"success":true,
"task_id":"amk-tool-ark-erase-video-subtitle-pro-65295360258",
"task_type":"ark-erase-video-subtitle-pro",
"status":"completed",
"result": {
        "video_url": "https://example.volcvideo.com/enhanced_output.mp4?auth_key=1775271661-..."
    },
"expires_at": 1775119556,
"created_at": 1774946747,
"finished_at": 1774946756,
"request_id":"202604131419582011F31E0C3DCBB48AA5"
}

---
API参考
发起字幕擦除任务
POST https://mediakit.cn-beijing.volces.com/api/v1/ark-tools/ark-erase-video-subtitle-pro
本接口用于提交一个异步的精细化字幕擦除任务。它利用 AI 算法针对视频字幕提供精细化检测与擦除功能，实现高质量无痕擦除效果，最大程度还原视频画面。 
任务提交成功后，您需要保存返回的 task_id，并通过轮询查询任务信息接口获取最终结果。
使用说明 
- 在首次使用擦除能力时系统需要一定时间进行初始化，预计需要5min左右，此时接口message会返回“system is initialing. please wait a moment to retry”，可稍后重新发起请求
- 为确保在网络波动或客户端重试等不确定场景下，同一个处理请求不被重复执行，所有任务提交接口均采用幂等性设计。
  - 为什么需要幂等性：防止因客户端重试、网络抖动等原因导致同一个任务被多次执行，从而避免不必要的资源消耗和重复计费。
  - 默认幂等行为：当您调用一个任务提交接口时，AI MediaKit 会根据您的账户信息和核心请求参数组合生成一个唯一标识。如果在该任务成功提交的两天内，系统收到一个具有相同标识的请求，将不会创建新任务，而是会返回与首次请求相同的结果（例如，返回同一个 task_id）。

请求参数 
Header 参数 
参数 
类型 
是否必选 
示例值 
描述 
Authorization
String 
是 
Bearer {Your_API_Key}
格式为 Bearer {Your_API_Key}。方舟API Key
Body 参数 
参数 
类型 
是否必选 
示例值 
描述 
video_url
String
是 
"https://example.com/source.mp4"
待擦除字幕的视频 URL。 
- 视频来源：仅支持方舟生成的视频 URL。 
响应参数
参数 
类型 
描述 
success
Boolean 
任务是否提交成功。 
- true：成功。 
- false：失败。更多信息请查看错误处理。 
task_id
String 
任务的唯一标识，用于后续查询任务进度和结果。 
request_id
String 
本次请求的唯一标识，可用于问题排查。 
示例： 
{
    "success": true,
    "task_id": "amk-tool-ark-erase-video-subtitle-pro-1703200",
    "request_id": "20260415150000******24A6A0D94B7FF1"
}

错误处理 
当请求的参数或鉴权信息不正确时，任务将不会被创建，接口会返回一个同步的错误响应。详见错误码。示例如下： 
{
  "success": false,
  "task_id": "",
  "request_id": "20240521170000AABBCCDD112233",
  "error": {
    "code": "InvalidParameter",
    "message": "validating root: required: missing properties: [\"video_url\"]",
    "type": "BadRequest"
  }
}
查询字幕擦除任务结果
GET https://mediakit.cn-beijing.volces.com/api/v1/ark-tasks/{task_id}
请求参数
Path 参数
参数
类型
是否必选
示例值
描述
task_id
String
是
amk-tool-ark-erase-video-subtitle-pro-14***24
任务的唯一标识。在提交异步任务时，从响应体中获取。
Header 参数
参数
类型
是否必选
示例值
描述
Authorization
String
是
Bearer {Your_API_Key}

格式为 Bearer {Your_API_Key}。请参考基础概念及准备工作获取 API Key。
响应参数
接口的响应体为一个 JSON 对象，包含了任务的详细信息。
参数
类型
描述
success
Boolean
标识本次 API 请求是否被成功处理。
- true：服务端成功处理了查询请求。
- false：请求失败，具体原因请查看 error 字段。
说明
此字段仅代表查询操作本身是否成功，不代表任务的执行状态。
task_id
String
所查询任务的唯一标识。
task_type
String
任务类型。例如 ark-erase-video-subtitle-pro（精细化字幕擦除）等。
status
String
任务当前的状态。枚举值：
- running：任务正在处理中。
- completed：任务已成功完成。
- failed：任务处理失败。
result
Object
任务成功时返回的结果对象。仅当 status 为 completed 时出现。其内容结构请参见下文Result 对象。
error

Object
任务失败时返回的错误详情对象，或在任务成功时为 null。其内容结构请参见下文 Error 对象。
expires_at
String
任务结果的过期时间戳（Unix Time，单位：秒）。仅当任务成功且有结果时返回。
created_at
String
任务创建时间戳（Unix Time，单位：秒）。
finished_at
String
任务完成（成功或失败）的时间戳（Unix Time，单位：秒）。仅当 status 为 completed 或 failed 时出现。
request_id
String
本次 API 请求的唯一标识符，可用于问题排查。
Result 对象
当 status 为 completed 时，响应会包含 result 对象。
参数
类型
示例
描述
video_url
String
"https://example.volcvideo.com/output.mp4?auth_key=..."
输出视频的 URL。有效期为 24 小时。

Error 对象
当 success 为 false 或 status 为 failed 时，会返回 error 对象，包含错误详情。
参数
类型
描述
code
String
错误码。详见错误码。
message
String
错误描述信息，用于展示或记录日志。
param
String
(可选) 指示导致错误的具体参数名。
type
String
错误类型，如 TaskError 表示任务执行出错，ApiError 表示 API 调用出错。
响应示例
示例 1：任务正在运行
{
  "success": true,
  "task_id": "amk-tool-ark-erase-video-subtitle-pro-14***24",
  "task_type": "ark-erase-video-subtitle",
  "status": "running",
  "created_at": 1700484518,
  "request_id": "202603252052226AE61BF072A5A596F761"
}
示例 2：任务运行成功
Response：
{
    "success": true,
    "task_id": "amk-tool-ark-erase-video-subtitle-pro-1703200",
    "task_type": "ark-erase-video-subtitle",
    "status": "completed",
    "result": {
        "video_url": "https://example.volcvideo.com/enhanced_output.mp4?auth_key=1775271661-..."
    },
    "expires_at": 1775119556,
    "created_at": 1774946747,
    "finished_at": 1774946756,
    "request_id": "20260415150000******24A6A0D94B7FF1"
}
示例 3：任务执行失败
{
  "success": true,
  "task_id": " amk-tool-ark-erase-video-subtitle-pro-14***24",
  "task_type": "ark-erase-video-subtitle",
  "status": "failed",
  "error": {
    "code": "DownloadFailed",
    "message": "Failed to download file from the provided URL: https://example.com/nonexistent.mp4. Please check if the URL is correct and publicly accessible.",
    "param": "video_url",
    "type": "TaskError"
  },
  "created_at": 1700484518,
  "finished_at": 1700484522,
  "request_id": "202603252052226AE61BF072A5A596F761"
}

常见问题
问题1：擦除速度较慢？
- 不排队的情况下任务一般可以在20～30分钟以内可处理完成
- 若短时间内提交大量擦除任务会进入排队队列（受到整体资源池限制，同时提交的客户过多也会造成排队），建议业务侧平滑提交擦除任务，排队后一般可以在2～3小时内处理完成。