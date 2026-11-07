// Módulo de Gerenciamento de Áudio e Dispositivos (Mic & Fone estilo Discord)
window.ANG_Audio = {
  micStream: null,
  isMuted: false,
  isDeafened: false,
  selectedMicId: 'default',
  selectedSpeakerId: 'default',
  micVolume: 1,
  speakerVolume: 1,

  async init() {
    this.bindEvents();
    // Solicita acesso inicial ao microfone para o navegador revelar os nomes reais de todos os microfones e fones
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());
      }
    } catch (e) {
      console.warn('Permissão inicial mic:', e);
    }
    await this.refreshDevices();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => this.refreshDevices());
    }
  },

  async startMic() {
    try {
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
      }
      const constraints = {
        audio: {
          deviceId: this.selectedMicId === 'default' ? undefined : { exact: this.selectedMicId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioTrack = this.micStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMuted;
        // Adiciona a faixa de voz a todas as conexões WebRTC ativas
        if (window.S && window.S.peers) {
          for (const [uid, pc] of window.S.peers) {
            try {
              pc.addTrack(audioTrack, this.micStream);
              if (pc.signalingState === 'stable' && typeof window.renegotiatePeer === 'function') {
                window.renegotiatePeer(uid, pc);
              }
            } catch (err) {
              console.warn('[ANG_Audio] Falha ao enviar mic para peer:', err);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[ANG_Audio] Não foi possível capturar o microfone:', e);
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
    } else if (!this.isMuted) {
      this.startMic();
    }
    this.updateUI();
  },

  toggleDeaf() {
    this.isDeafened = !this.isDeafened;
    // Muta todos os elementos de áudio/vídeo recebidos
    const mainVideo = document.querySelector('#video');
    if (mainVideo) {
      mainVideo.muted = this.isDeafened;
    }
    // Muta todos os áudios remotos
    document.querySelectorAll('audio, video').forEach(el => {
      if (el.id !== 'localPreview') {
        el.muted = this.isDeafened;
      }
    });

    if (this.isDeafened && !this.isMuted) {
      this.toggleMute(); // Discord muta o mic automaticamente ao ensurdecer
    }
    this.updateUI();
  },

  setVolume(type, val) {
    const v = val / 100;
    if (type === 'mic') {
      this.micVolume = v;
      document.querySelector('#micVolVal').textContent = Math.round(val) + '%';
    } else {
      this.speakerVolume = v;
      document.querySelector('#speakerVolVal').textContent = Math.round(val) + '%';
      const mainVideo = document.querySelector('#video');
      if (mainVideo) mainVideo.volume = v;
      document.querySelectorAll('audio, video').forEach(el => el.volume = v);
    }
  },

  async setSpeakerDevice(deviceId) {
    this.selectedSpeakerId = deviceId;
    const mainVideo = document.querySelector('#video');
    if (mainVideo && typeof mainVideo.setSinkId === 'function') {
      try {
        await mainVideo.setSinkId(deviceId);
      } catch (err) {
        console.warn('Falha setSinkId:', err);
      }
    }
    this.renderDeviceLists();
  },

  async setMicDevice(deviceId) {
    this.selectedMicId = deviceId;
    await this.startMic();
    this.renderDeviceLists();
  },

  async refreshDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      this.devices = await navigator.mediaDevices.enumerateDevices();
      this.renderDeviceLists();
    } catch (e) {
      console.warn('Erro ao listar dispositivos:', e);
    }
  },

  renderDeviceLists() {
    if (!this.devices) return;
    const micList = document.querySelector('#micDeviceList');
    const spkList = document.querySelector('#speakerDeviceList');
    if (!micList || !spkList) return;

    micList.innerHTML = '';
    spkList.innerHTML = '';

    const inputs = this.devices.filter(d => d.kind === 'audioinput');
    const outputs = this.devices.filter(d => d.kind === 'audiooutput');

    // Opção padrão
    this.createDeviceItem(micList, 'default', 'Padrão do Windows', this.selectedMicId === 'default', (id) => this.setMicDevice(id));
    inputs.forEach((d, idx) => {
      this.createDeviceItem(micList, d.deviceId, d.label || ('Microfone ' + (idx + 1)), this.selectedMicId === d.deviceId, (id) => this.setMicDevice(id));
    });

    this.createDeviceItem(spkList, 'default', 'Padrão do Windows', this.selectedSpeakerId === 'default', (id) => this.setSpeakerDevice(id));
    outputs.forEach((d, idx) => {
      this.createDeviceItem(spkList, d.deviceId, d.label || ('Alto-falante ' + (idx + 1)), this.selectedSpeakerId === d.deviceId, (id) => this.setSpeakerDevice(id));
    });
  },

  createDeviceItem(container, id, label, isSelected, onClick) {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 4px; font-size: 12px; color: ' + (isSelected ? '#00FFFF' : '#DBDEE1') + '; cursor: pointer; transition: background 0.15s; user-select: none;';
    item.onmouseover = () => item.style.background = 'rgba(255,255,255,0.06)';
    item.onmouseout = () => item.style.background = 'transparent';
    item.innerHTML = '<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 175px;">' + (label || 'Dispositivo') + '</span>' + (isSelected ? '<span style="color:#00FFFF; font-size: 11px;">●</span>' : '');
    item.onclick = (e) => {
      e.stopPropagation();
      onClick(id);
    };
    container.appendChild(item);
  },

  updateUI() {
    const micBtn = document.querySelector('#toggleMicBtn');
    const micIcon = document.querySelector('#micIcon');
    const micWrap = document.querySelector('#micWrap');

    const deafBtn = document.querySelector('#toggleDeafBtn');
    const deafIcon = document.querySelector('#deafIcon');
    const deafWrap = document.querySelector('#deafWrap');

    if (this.isMuted) {
      micWrap.style.background = 'rgba(218, 55, 60, 0.15)';
      micWrap.style.borderColor = '#DA373C';
      micBtn.style.color = '#DA373C';
      micIcon.innerHTML = '<path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17L15 11V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>';
      micBtn.title = 'Ativar Microfone';
    } else {
      micWrap.style.background = '#111418';
      micWrap.style.borderColor = 'rgba(255,255,255,0.08)';
      micBtn.style.color = '#949BA4';
      micIcon.innerHTML = '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>';
      micBtn.title = 'Desativar Microfone';
    }

    if (this.isDeafened) {
      deafWrap.style.background = 'rgba(218, 55, 60, 0.15)';
      deafWrap.style.borderColor = '#DA373C';
      deafBtn.style.color = '#DA373C';
      deafIcon.innerHTML = '<path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1a7 7 0 0 1 14 0v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/><line x1="3" y1="3" x2="21" y2="21" stroke="#DA373C" stroke-width="2.5" stroke-linecap="round"/>';
      deafBtn.title = 'Ativar Áudio da Chamada/Transmissão';
    } else {
      deafWrap.style.background = '#111418';
      deafWrap.style.borderColor = 'rgba(255,255,255,0.08)';
      deafBtn.style.color = '#949BA4';
      deafIcon.innerHTML = '<path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1a7 7 0 0 1 14 0v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/>';
      deafBtn.title = 'Desativar Áudio da Chamada/Transmissão';
    }
  },

  bindEvents() {
    const micBtn = document.querySelector('#toggleMicBtn');
    const micArrow = document.querySelector('#micMenuArrow');
    const micMenu = document.querySelector('#micDropdown');

    const deafBtn = document.querySelector('#toggleDeafBtn');
    const deafArrow = document.querySelector('#deafMenuArrow');
    const deafMenu = document.querySelector('#deafDropdown');

    const micSlider = document.querySelector('#micVolumeSlider');
    const spkSlider = document.querySelector('#speakerVolumeSlider');

    if (micBtn) micBtn.onclick = () => this.toggleMute();
    if (deafBtn) deafBtn.onclick = () => this.toggleDeaf();

    if (micArrow) {
      micArrow.onclick = (e) => {
        e.stopPropagation();
        if (deafMenu) deafMenu.classList.add('hidden');
        micMenu.classList.toggle('hidden');
        this.refreshDevices();
      };
    }

    if (deafArrow) {
      deafArrow.onclick = (e) => {
        e.stopPropagation();
        if (micMenu) micMenu.classList.add('hidden');
        deafMenu.classList.toggle('hidden');
        this.refreshDevices();
      };
    }

    if (micSlider) {
      micSlider.oninput = (e) => this.setVolume('mic', e.target.value);
    }
    if (spkSlider) {
      spkSlider.oninput = (e) => this.setVolume('spk', e.target.value);
    }

    document.addEventListener('click', (e) => {
      if (micMenu && !micMenu.contains(e.target) && e.target !== micArrow) micMenu.classList.add('hidden');
      if (deafMenu && !deafMenu.contains(e.target) && e.target !== deafArrow) deafMenu.classList.add('hidden');
    });
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.ANG_Audio.init();
});
