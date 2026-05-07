const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const spacingSlider = document.getElementById('spacing-slider');
const spacingValue = document.getElementById('spacing-value');
const mergeBtn = document.getElementById('merge-btn');
const downloadBtn = document.getElementById('download-btn');
const previewBtn = document.getElementById('preview-btn');
const statusMessage = document.getElementById('status-message');

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let uploadedFiles = [];
let mergedAudioBuffer = null;
let currentPreviewNode = null;

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Highlight drop zone when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

// Handle dropped files
dropZone.addEventListener('drop', handleDrop, false);

// Handle selected files from input
fileInput.addEventListener('change', handleFilesSelect, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

function handleFilesSelect(e) {
  const files = e.target.files;
  handleFiles(files);
}

function handleFiles(files) {
  const audioFiles = Array.from(files).filter(file => file.name.match(/\.(wav|mp3)$/i));
  
  if (audioFiles.length > 0) {
    processFiles(audioFiles);
  } else {
    alert('Please upload .wav or .mp3 audio files only.');
  }
}

async function processFiles(files) {
  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      uploadedFiles.push({
        file: file,
        buffer: audioBuffer,
        duration: audioBuffer.duration
      });
    } catch (err) {
      console.error('Error decoding file:', file.name, err);
      alert(`Failed to decode ${file.name}`);
    }
  }
  updateFileList();
}

function formatDuration(seconds) {
  if (!seconds) return '0.00s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}.${ms.toString().padStart(2, '0')}s`;
}

function updateFileList() {
  if (uploadedFiles.length === 0) {
    fileList.innerHTML = '<li class="empty-message">No files uploaded yet.</li>';
    return;
  }

  fileList.innerHTML = '';
  uploadedFiles.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.25rem;">
        <span class="file-name">${item.file.name}</span>
        <span class="file-meta" style="font-size:0.85rem; color:#555; font-weight:400;">Duration: ${formatDuration(item.duration)}</span>
      </div>
      <button class="remove-btn" data-index="${index}" title="Remove file">&times;</button>
    `;
    fileList.appendChild(li);
  });

  // Attach event listeners to remove buttons
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      uploadedFiles.splice(index, 1);
      updateFileList();
    });
  });
}

// Update slider value display
spacingSlider.addEventListener('input', (e) => {
  spacingValue.textContent = `${e.target.value}ms`;
});

// Merge functionality using Web Audio API
mergeBtn.addEventListener('click', () => {
  if (uploadedFiles.length === 0) {
    alert("Please upload some audio files first.");
    return;
  }
  
  const originalText = mergeBtn.textContent;
  mergeBtn.textContent = 'MERGING...';
  mergeBtn.disabled = true;
  
  // Calculate duration and spacing
  const spacingMs = parseFloat(spacingSlider.value);
  const spacingSec = spacingMs / 1000;
  
  let totalDuration = 0;
  for (let i = 0; i < uploadedFiles.length; i++) {
    totalDuration += uploadedFiles[i].buffer.duration;
    if (i < uploadedFiles.length - 1) {
      totalDuration += spacingSec;
    }
  }
  
  // Create combined buffer (safely using 2 channels)
  const sampleRate = audioContext.sampleRate;
  const numberOfChannels = 2; 
  const totalLength = Math.ceil(totalDuration * sampleRate);
  
  mergedAudioBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
  
  // Copy audio data into combined buffer
  let currentOffset = 0;
  for (let i = 0; i < uploadedFiles.length; i++) {
    const buffer = uploadedFiles[i].buffer;
    
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const mergedChannelData = mergedAudioBuffer.getChannelData(channel);
      // Map mono correctly if original is mono
      const sourceChannel = channel < buffer.numberOfChannels ? channel : 0;
      const bufferChannelData = buffer.getChannelData(sourceChannel);
      
      mergedChannelData.set(bufferChannelData, currentOffset);
    }
    
    // Increment offset (buffer length + silence)
    currentOffset += buffer.length + Math.ceil(spacingSec * sampleRate);
  }
  
  // UI Updates
  mergeBtn.textContent = originalText;
  mergeBtn.disabled = false;
  downloadBtn.disabled = false;
  previewBtn.disabled = false;
  
  statusMessage.style.display = 'block';
  statusMessage.innerHTML = `Merged ${uploadedFiles.length} samples<br>Spacing: ${spacingMs}ms<br>Total duration: ${formatDuration(totalDuration)}`;
});

// Playback preview functionality
previewBtn.addEventListener('click', () => {
  if (!mergedAudioBuffer) return;
  
  // Restart if already playing
  if (currentPreviewNode) {
    try {
      currentPreviewNode.stop();
    } catch(e) {}
    currentPreviewNode.disconnect();
  }
  
  // Resume context if suspended (required by browsers)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  currentPreviewNode = audioContext.createBufferSource();
  currentPreviewNode.buffer = mergedAudioBuffer;
  currentPreviewNode.connect(audioContext.destination);
  currentPreviewNode.start(0);
  
  currentPreviewNode.onended = () => {
    currentPreviewNode = null;
  };
});

// Actual Download functionality
downloadBtn.addEventListener('click', () => {
  if (!mergedAudioBuffer) return;
  
  const originalText = downloadBtn.textContent;
  downloadBtn.textContent = 'ENCODING...';
  downloadBtn.disabled = true;
  
  // Use a slight timeout to allow the UI to update to "ENCODING..." before synchronous processing
  setTimeout(() => {
    try {
      const wavBlob = bufferToWav(mergedAudioBuffer);
      const url = URL.createObjectURL(wavBlob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `merged-samples-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      console.error(e);
      alert('Error encoding WAV file.');
    } finally {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
    }
  }, 50);
});

// Utility: Convert AudioBuffer to WAV Blob
function bufferToWav(audioBuffer) {
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2);                      // block-align
  setUint16(16);                                 // 16-bit

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // write interleaved data
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true);          // write 16-bit sample
      pos += 2;
    }
    offset++; // next source sample
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}
