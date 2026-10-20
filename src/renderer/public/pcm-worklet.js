// Collects mono 16 kHz PCM (the AudioContext resamples) and posts it in 100 ms frames.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frame = new Float32Array(1600)
    this.n = 0
  }

  process(inputs) {
    const channels = inputs[0]
    if (!channels || channels.length === 0) return true
    const len = channels[0].length
    for (let i = 0; i < len; i++) {
      let sum = 0
      for (let c = 0; c < channels.length; c++) sum += channels[c][i]
      this.frame[this.n++] = sum / channels.length
      if (this.n === this.frame.length) {
        this.port.postMessage(this.frame)
        this.frame = new Float32Array(1600)
        this.n = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
