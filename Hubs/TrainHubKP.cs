using Microsoft.AspNetCore.SignalR;

namespace HawkAI.Hubs
{
    /// <summary>
    /// SignalR hub for YOLO Pose(Keypoint) training status.
    /// Kept separate from TrainHub to avoid impacting existing detector workflow.
    /// </summary>
    public class TrainHubKP : Hub
    {
        // 현재는 전송만 사용 (Controller에서 Clients.All로 push)
    }
}
