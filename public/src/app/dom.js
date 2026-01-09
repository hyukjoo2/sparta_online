// /src/app/dom.js
export function getDomRefs(doc = document) {
  const el = {
    topForm: doc.getElementById("topForm"),
    priceInput: doc.getElementById("priceInput"),
    fileStatus: doc.getElementById("fileStatus"),
    priceBadge: doc.getElementById("priceBadge"),

    pnlText: doc.getElementById("pnlText"),
    adenaTimer: doc.getElementById("adenaTimer"),

    leftOrb: doc.getElementById("leftOrb"),
    rightOrb: doc.getElementById("rightOrb"),

    leftFill: doc.getElementById("leftFill"),
    leftLabel: doc.getElementById("leftLabel"),
    rightFill: doc.getElementById("rightFill"),
    rightLabel: doc.getElementById("rightLabel"),

    openBtn: doc.getElementById("openBtn"),
    saveOpenedBtn: doc.getElementById("saveOpenedBtn"),
    mobileSaveBtn: doc.getElementById("mobileSaveBtn"),
    downloadBtn: doc.getElementById("downloadBtn"),

    historyBtn: doc.getElementById("historyBtn"),
    reloadBtn: doc.getElementById("reloadBtn"),
    ocoBtn: doc.getElementById("ocoBtn"),
    calcBtn: doc.getElementById("calcBtn"),

    bgm: doc.getElementById("bgm"),
    bgToggleBtn: doc.getElementById("bgToggleBtn"),
    playBtn: doc.getElementById("playBtn"),
    muteBtn: doc.getElementById("muteBtn"),
    volSlider: doc.getElementById("volSlider"),
    playIcon: doc.getElementById("playIcon"),
    pauseIcon: doc.getElementById("pauseIcon"),
    volOnIcon: doc.getElementById("volOnIcon"),
    volOffIcon: doc.getElementById("volOffIcon"),

    modalBackdrop: doc.getElementById("modalBackdrop"),
    modalRoot: doc.getElementById("modalRoot"),
    modalTitle: doc.getElementById("modalTitle"),
    modalHint: doc.getElementById("modalHint"),
    modalBody: doc.getElementById("modalBody"),
    modalClose: doc.getElementById("modalClose"),

    countdownLabel: doc.getElementById("countdownLabel"),
    countdownText: doc.getElementById("countdownText"),

    bgA: doc.getElementById("bgA"),
    bgB: doc.getElementById("bgB"),

    bottomFill: doc.getElementById("bottomFill"),
    bottomValue: doc.getElementById("bottomValue"),

    consoleLog: doc.getElementById("consoleLog"),
    consoleCmd: doc.getElementById("consoleCmd"),

    quotaTicker: doc.getElementById("quotaTicker"),
  };

  return el;
}