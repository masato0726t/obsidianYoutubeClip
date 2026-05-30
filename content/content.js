function getVideoInfo() {
  try {
    const data = window.ytInitialPlayerResponse;
    if (!data?.videoDetails) return null;

    const videoDetails = data.videoDetails;
    const captionTracks =
      data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    return {
      title: videoDetails.title,
      videoId: videoDetails.videoId,
      channelTitle: videoDetails.author,
      lengthSeconds: parseInt(videoDetails.lengthSeconds) || 0,
      captionTracks: captionTracks.map((track) => ({
        languageCode: track.languageCode,
        name: track.name?.simpleText || track.languageCode,
        baseUrl: track.baseUrl,
      })),
    };
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "getVideoInfo") {
    sendResponse(getVideoInfo());
  }
  return true;
});
