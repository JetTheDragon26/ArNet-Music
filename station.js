let player = null;
let stationConfig = null;
let metadataTimer = null;


/* =========================================================
   CONFIGURATION
========================================================= */

async function loadConfig() {
  try {
    const response = await fetch("config.json");

    if (!response.ok) {
      throw new Error(
        `Config request failed: ${response.status}`
      );
    }

    stationConfig = await response.json();

    applyStationConfig();

    initializeYouTubeSource();

  } catch (error) {
    console.error(
      "ARNet Music configuration error:",
      error
    );

    setStatus("CONFIG ERROR");
    setSignalStatus("OFFLINE");

    const title =
      document.getElementById("trackTitle");

    if (title) {
      title.textContent =
        "Unable to load station configuration";
    }
  }
}


/* =========================================================
   APPLY CONFIG TO DISPLAY
========================================================= */

function applyStationConfig() {
  if (!stationConfig) {
    return;
  }

  const station =
    stationConfig.station || {};

  const channel =
    stationConfig.channel || {};

  const source =
    stationConfig.source || {};

  const receiver =
    stationConfig.receiver || {};


  setText(
    "stationName",
    station.name || "ARNet Music Network"
  );

  setText(
    "serviceText",
    station.shortName || "ARNet Music"
  );


  if (typeof channel.center === "number") {
    setText(
      "frequencyText",
      `${channel.center.toFixed(2)} ${channel.unit || "Vt"}`
    );

    setText(
      "frequencyDisplay",
      channel.center.toFixed(2)
    );
  }


  if (channel.mode) {
    setText(
      "modeText",
      channel.mode
    );

    setText(
      "frequencyMode",
      channel.mode
    );

    setText(
      "sidebandText",
      channel.mode
    );
  }


  if (channel.base !== undefined) {
    setText(
      "channelText",
      channel.base
    );
  }


  if (
    channel.occupiedRange &&
    typeof channel.occupiedRange.low === "number"
  ) {
    setText(
      "frequencyLow",
      channel.occupiedRange.low.toFixed(2)
    );
  }


  if (
    channel.occupiedRange &&
    typeof channel.occupiedRange.high === "number"
  ) {
    setText(
      "frequencyHigh",
      channel.occupiedRange.high.toFixed(2)
    );
  }


  if (source.type) {
    setText(
      "sourceText",
      source.type.toUpperCase()
    );
  }


  const defaultVolume =
    Number(receiver.defaultVolume ?? 70);

  const slider =
    document.getElementById("volumeSlider");

  if (slider) {
    slider.value = defaultVolume;
  }

  setText(
    "volumeValue",
    `${defaultVolume}%`
  );
}


/* =========================================================
   YOUTUBE INITIALIZATION
========================================================= */

function initializeYouTubeSource() {
  if (!stationConfig) {
    return;
  }

  if (
    !stationConfig.source ||
    stationConfig.source.type !== "youtube"
  ) {
    setStatus("SOURCE READY");

    setText(
      "trackTitle",
      "Local audio mode not configured yet"
    );

    setText(
      "trackInfo",
      "Waiting for future ARNet audio source"
    );

    return;
  }

  if (
    window.YT &&
    typeof window.YT.Player === "function"
  ) {
    createYouTubePlayer();
  }
}


/* =========================================================
   REQUIRED YOUTUBE CALLBACK
========================================================= */

function onYouTubeIframeAPIReady() {
  if (
    stationConfig &&
    stationConfig.source &&
    stationConfig.source.type === "youtube"
  ) {
    createYouTubePlayer();
  }
}


/* =========================================================
   CREATE PLAYER
========================================================= */

function createYouTubePlayer() {
  if (player) {
    return;
  }

  if (
    !stationConfig ||
    !stationConfig.source ||
    !stationConfig.source.playlistId
  ) {
    console.error(
      "ARNet Music: No YouTube playlist ID configured."
    );

    setStatus("SOURCE ERROR");

    return;
  }


  player = new YT.Player(
    "youtube-player",
    {
      height: "1",

      width: "1",

      playerVars: {
        listType: "playlist",

        list:
          stationConfig.source.playlistId,

        autoplay: 1,

        controls: 0,

        disablekb: 1,

        fs: 0,

        playsinline: 1,

        rel: 0
      },

      events: {
        onReady:
          onPlayerReady,

        onStateChange:
          onPlayerStateChange,

        onError:
          onPlayerError
      }
    }
  );
}


/* =========================================================
   PLAYER READY
========================================================= */

function onPlayerReady(event) {
  const receiver =
    stationConfig.receiver || {};

  const volume =
    Number(receiver.defaultVolume ?? 70);

  event.target.setVolume(volume);

  setText(
    "volumeValue",
    `${volume}%`
  );


  setStatus("ON AIR");

  setSignalStatus("RECEIVING");

  setText(
    "programStatus",
    "ARNet program feed active"
  );


  /*
    Browsers may block autoplay with sound.

    We still ask YouTube to start playback.
    If autoplay is blocked, user interaction
    with the page may be required.
  */

  event.target.playVideo();


  updateMetadata();

  startMetadataUpdates();
}


/* =========================================================
   PLAYER STATE
========================================================= */

function onPlayerStateChange(event) {
  switch (event.data) {

    case YT.PlayerState.PLAYING:

      setStatus("ON AIR");

      setSignalStatus("RECEIVING");

      setText(
        "programStatus",
        "ARNet program feed active"
      );

      updateMetadata();

      break;


    case YT.PlayerState.BUFFERING:

      setSignalStatus("BUFFERING");

      setText(
        "programStatus",
        "Program feed buffering"
      );

      break;


    case YT.PlayerState.CUED:

      setSignalStatus("STANDBY");

      break;


    case YT.PlayerState.PAUSED:

      /*
        The dashboard itself has no pause control.

        YouTube or browser behavior can still
        occasionally pause playback.
      */

      setSignalStatus("PROGRAM HOLD");

      setText(
        "programStatus",
        "Program source temporarily paused"
      );

      break;


    case YT.PlayerState.ENDED:

      setSignalStatus("PROGRAM CHANGE");

      setText(
        "programStatus",
        "Loading next broadcast item"
      );

      break;


    default:
      break;
  }
}


/* =========================================================
   YOUTUBE ERRORS
========================================================= */

function onPlayerError(event) {
  console.error(
    "ARNet Music YouTube error:",
    event.data
  );

  setStatus("SOURCE ERROR");

  setSignalStatus("NO SIGNAL");

  setText(
    "programStatus",
    `YouTube source error ${event.data}`
  );
}


/* =========================================================
   NOW PLAYING METADATA
========================================================= */

function updateMetadata() {
  if (
    !player ||
    typeof player.getVideoData !== "function"
  ) {
    return;
  }


  const videoData =
    player.getVideoData();


  if (!videoData) {
    return;
  }


  if (videoData.title) {
    setText(
      "trackTitle",
      videoData.title
    );
  }


  if (videoData.author) {
    setText(
      "trackInfo",
      videoData.author
    );
  } else {
    setText(
      "trackInfo",
      "ARNet Music Network"
    );
  }
}


/* =========================================================
   PERIODIC METADATA UPDATE
========================================================= */

function startMetadataUpdates() {
  if (metadataTimer) {
    clearInterval(metadataTimer);
  }

  metadataTimer =
    setInterval(
      updateMetadata,
      3000
    );
}


/* =========================================================
   RECEIVER VOLUME
========================================================= */

const volumeSlider =
  document.getElementById("volumeSlider");


if (volumeSlider) {
  volumeSlider.addEventListener(
    "input",
    function () {

      const volume =
        Number(this.value);

      if (
        player &&
        typeof player.setVolume === "function"
      ) {
        player.setVolume(volume);
      }


      setText(
        "volumeValue",
        `${volume}%`
      );
    }
  );
}


/* =========================================================
   RECEIVER MUTE
========================================================= */

const muteButton =
  document.getElementById("muteButton");


if (muteButton) {
  muteButton.addEventListener(
    "click",
    function () {

      if (!player) {
        return;
      }


      if (player.isMuted()) {

        player.unMute();

        muteButton.textContent =
          "MUTE";

        muteButton.setAttribute(
          "aria-label",
          "Mute ARNet Music"
        );

      } else {

        player.mute();

        muteButton.textContent =
          "UNMUTE";

        muteButton.setAttribute(
          "aria-label",
          "Unmute ARNet Music"
        );
      }
    }
  );
}


/* =========================================================
   HELPER FUNCTIONS
========================================================= */

function setText(id, text) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}


function setStatus(text) {
  setText(
    "statusText",
    text
  );

  setText(
    "onAirText",
    text === "ON AIR"
      ? "ON AIR"
      : text
  );
}


function setSignalStatus(text) {
  setText(
    "signalStatus",
    text
  );
}


/* =========================================================
   START ARNET MUSIC
========================================================= */

loadConfig();
