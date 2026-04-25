# Sprint 10: Documentation & Release
## Status: Planning Complete

**Sprint Goal**: Complete all documentation, setup guides, and prepare for public release  
**Date**: April 7, 2026  
**Prerequisite**: Sprints 1-9 complete

---

## 📚 Documentation Matrix

| Document | Status | Location | Priority |
|----------|--------|----------|----------|
| README | 🔄 Draft | `/README.md` | P0 |
| Quick Start | 🔄 Draft | `/docs/QUICK_START.md` | P0 |
| Installation Guide | 🔄 Draft | `/docs/INSTALL.md` | P0 |
| Architecture | ✅ Complete | `/docs/voice/ARCHITECTURE_COMPLETE.md` | P1 |
| API Reference | ⏳ Planned | `/docs/API.md` | P1 |
| Troubleshooting | 🔄 Draft | `/docs/TROUBLESHOOTING.md` | P0 |
| Language Support | ⏳ Planned | `/docs/LANGUAGES.md` | P2 |
| Security Whitepaper | ⏳ Planned | `/docs/SECURITY.md` | P2 |
| Contributing | ⏳ Planned | `/CONTRIBUTING.md` | P3 |
| Changelog | ⏳ Planned | `/CHANGELOG.md` | P3 |

---

## 📝 README.md Structure

```markdown
# Dirgha Voice CLI

> 100% local voice AI. Zero API keys. Zero cloud. Privacy-first.

## 🚀 Quick Start

```bash
# Install
npm install -g @dirgha/cli

# Setup (one-time, ~3GB download)
dirgha voice --setup

# Start using voice
dirgha voice
```

## ✨ Features

- 🎤 **Local Speech Recognition** - whisper.cpp, 99 languages
- 🧠 **Local AI** - Gemma 4 LLM, runs on your hardware
- 🔊 **Text-to-Speech** - Piper, natural sounding voices
- 📱 **Mobile Bridge** - Use your phone as microphone
- 💻 **IDE Integration** - VS Code extension
- 🌐 **Browser Extension** - Voice for web forms
- 🔒 **100% Private** - No data leaves your device

## 📦 Installation

### Requirements
- macOS 12+, Linux, or Windows 10+
- 4GB RAM minimum (8GB recommended)
- 3GB free disk space

### Install via npm
```bash
npm install -g @dirgha/cli
```

### Install via Homebrew (macOS)
```bash
brew install dirgha
```

### Build from Source
```bash
git clone https://github.com/dirgha-ai/cli.git
cd cli
pnpm install
pnpm build
```

## 🎮 Usage

### Basic Voice Command
```bash
dirgha voice
# Speak: "Create a React component for login"
# [AI creates the file]
```

### Personal Plex (Two-way Conversation)
```bash
dirgha voice --plex
# "Hey Dirgha, what's the weather?"
# "I can help you build a weather app!"
```

### Mobile as Microphone
```bash
dirgha voice --mobile
# Scan QR code with phone
# Speak into phone, transcribes on desktop
```

## 🌍 Language Support

- **English** (en) - Primary, best quality
- **Hindi** (hi) - Full support
- **Tamil** (ta) - Full support
- **Telugu** (te) - Full support
- **Chinese** (zh) - Full support
- **+94 more** - See [LANGUAGES.md](./docs/LANGUAGES.md)

## 🔧 Configuration

```bash
# Set default language
dirgha config set language hi

# Set voice model
dirgha config set voice-model whisper-small

# Set LLM model
dirgha config set llm-model gemma4-4b

# GPU acceleration
dirgha config set gpu auto
```

## 🛠️ Advanced Usage

### Model Management
```bash
dirgha models list
dirgha models download whisper-large
dirgha models remove whisper-base
```

### VS Code Extension
```bash
code --install-extension dirgha-voice-1.0.0.vsix
# Use Ctrl+Shift+D to dictate code
```

### Browser Extension
See [extensions/browser/README.md](./extensions/browser/README.md)

## 🐛 Troubleshooting

### "Out of memory" error
- Close other applications
- Use quantized models: `dirgha voice --model=gemma4-4b-q4_0`
- Enable GPU: `dirgha voice --gpu`

### Slow transcription
- Use smaller whisper model (base instead of small)
- Enable GPU acceleration
- Check CPU usage

### Microphone not detected
- Check permissions (macOS: System Preferences → Security → Microphone)
- Try different audio input: `dirgha voice --input=1`

See [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for more.

## 🔒 Privacy & Security

- **Zero data transmission** - Everything processed locally
- **No API keys** - No cloud service dependencies
- **Open source** - MIT licensed, auditable code
- **Encrypted storage** - Local models encrypted at rest

See [SECURITY.md](./docs/SECURITY.md) for details.

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](./LICENSE)

## 🙏 Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - Speech recognition
- [Gemma](https://ai.google.dev/gemma) - Local LLM
- [Piper](https://github.com/rhasspy/piper) - Text-to-speech
- [Ollama](https://ollama.ai) - LLM management
```

---

## 📖 Installation Guide (INSTALL.md)

### Platform-Specific Instructions

#### macOS

**Homebrew (Recommended)**:
```bash
brew tap dirgha/tap
brew install dirgha-cli
```

**Manual**:
```bash
curl -fsSL https://dirgha.ai/install.sh | sh
```

**From Source**:
```bash
git clone https://github.com/dirgha-ai/cli.git
cd cli
pnpm install
pnpm build
sudo ln -s $(pwd)/dist/dirgha.mjs /usr/local/bin/dirgha
```

#### Linux

**Ubuntu/Debian**:
```bash
curl -fsSL https://dirgha.ai/install.sh | sh
# Or
sudo apt install dirgha-cli
```

**Arch**:
```bash
yay -S dirgha-cli
```

**From Source**:
```bash
# Dependencies
sudo apt-get install build-essential libasound2-dev

# Build
git clone https://github.com/dirgha-ai/cli.git
cd cli
pnpm install
pnpm build
sudo ln -s $(pwd)/dist/dirgha.mjs /usr/local/bin/dirgha
```

#### Windows

**PowerShell**:
```powershell
iwr -useb https://dirgha.ai/install.ps1 | iex
```

**Chocolatey**:
```powershell
choco install dirgha-cli
```

**Manual**:
1. Download `dirgha-windows-x64.exe` from releases
2. Add to PATH

---

## 🛠️ Troubleshooting Guide (TROUBLESHOOTING.md)

### Common Issues

#### "Cannot find module 'better-sqlite3'"
**Solution**: Rebuild native modules
```bash
cd /root/dirgha-ai/domains/10-computer/cli
pnpm rebuild
```

#### "Model download fails"
**Solutions**:
1. Check internet connection
2. Use `--mirror` flag for alternative download source
3. Manually download from Hugging Face

#### "Permission denied"
**Solution**: Fix permissions
```bash
chmod +x dist/dirgha.mjs
sudo chown $(whoami) ~/.dirgha
```

#### "Out of memory"
**Solutions**:
1. Close other applications
2. Use smaller models: `dirgha voice --model=whisper-tiny`
3. Enable swap: `sudo swapon /swapfile`
4. Use quantized models: `dirgha models download gemma4-4b-q4_0`

#### "Microphone not working"
**macOS**:
- System Preferences → Security & Privacy → Microphone
- Enable for Terminal/iTerm

**Linux**:
```bash
# Check ALSA
arecord -l
# Check PulseAudio
pactl list sources
```

**Windows**:
- Settings → Privacy → Microphone
- Enable for apps

#### "GPU not detected"
**NVIDIA**:
```bash
# Install CUDA
sudo apt install nvidia-cuda-toolkit
# Verify
nvidia-smi
```

**macOS**:
- Metal is auto-detected on Apple Silicon
- Intel Macs: Use CPU only

#### "Slow performance"
**Optimizations**:
1. Enable GPU: `dirgha voice --gpu`
2. Use smaller models
3. Close other applications
4. Check CPU throttling

---

## 🌍 Language Support Matrix (LANGUAGES.md)

### Tier 1: Fully Supported

| Language | Code | STT | LLM | TTS | Quality |
|----------|------|-----|-----|-----|---------|
| English | en | ✅ | ✅ | ✅ | Excellent |
| Hindi | hi | ✅ | 🔄 | ⚠️ | Good |
| Tamil | ta | ✅ | 🔄 | ⚠️ | Good |
| Telugu | te | ✅ | 🔄 | ⚠️ | Good |
| Chinese | zh | ✅ | 🔄 | ⚠️ | Good |

**Legend**:
- ✅ Full support
- 🔄 Partial (some features)
- ⚠️ Community/limited

### Tier 2: Community Support

| Language | Code | Notes |
|----------|------|-------|
| Spanish | es | Whisper supports, LLM needs fine-tuning |
| French | fr | Whisper supports, LLM needs fine-tuning |
| German | de | Whisper supports, LLM needs fine-tuning |
| Japanese | ja | Whisper supports, limited TTS |

### Adding New Languages

1. Verify whisper.cpp support
2. Test LLM with language prompts
3. Find TTS voice
4. Submit PR with language config

---

## 🔒 Security Whitepaper (SECURITY.md)

### Threat Model

#### Assets
1. Voice recordings (audio data)
2. Transcriptions (text)
3. Conversation history
4. Downloaded models
5. User configuration

#### Threats

**T1: Eavesdropping**
- **Risk**: Attacker intercepts audio
- **Mitigation**: Local processing only, never transmits

**T2: Model Poisoning**
- **Risk**: Malicious model downloaded
- **Mitigation**: Checksum verification, signed models

**T3: Memory Scraping**
- **Risk**: Other processes read voice data from RAM
- **Mitigation**: Secure memory handling, encryption at rest

**T4: History Exposure**
- **Risk**: Conversation history leaked
- **Mitigation**: Local-only storage, optional encryption

### Security Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Local Processing | whisper.cpp + Gemma on-device | ✅ |
| No Network STT | No cloud transcription APIs | ✅ |
| Checksum Verification | SHA-256 on models | 🔄 |
| Signed Models | GPG signatures | ⏳ |
| Encrypted Storage | AES-256 for history | 🔄 |
| Memory Wiping | Secure deletion | ⏳ |

### Privacy Guarantees

1. **Zero Data Transmission**: No audio, text, or metadata leaves device
2. **No Telemetry**: No usage analytics collected
3. **No Account Required**: No signup, no tracking
4. **Open Source**: Auditable by security researchers
5. **Local-First**: Works offline, user owns data

---

## 📋 Release Checklist

### Pre-Release

- [ ] All tests passing
- [ ] Documentation complete
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Cross-platform testing
- [ ] Beta user feedback incorporated

### Release Steps

1. **Version Bump**
   ```bash
   npm version 1.0.0
   ```

2. **Tag Release**
   ```bash
   git tag -a v1.0.0 -m "Initial release"
   git push origin v1.0.0
   ```

3. **Build Packages**
   ```bash
   pnpm build
   pnpm package
   ```

4. **Publish to npm**
   ```bash
   npm publish --access public
   ```

5. **Create GitHub Release**
   - Upload binaries
   - Write release notes
   - Link documentation

6. **Update Homebrew**
   ```bash
   brew bump-formula-pr dirgha-cli
   ```

7. **Announce**
   - Twitter/X
   - Hacker News
   - Product Hunt
   - Newsletter

---

## 📊 Success Criteria

| Metric | Target | Status |
|--------|--------|--------|
| Documentation Coverage | 100% | 🔄 80% |
| Quick Start Works | First try | ⏳ To test |
| Zero Open Issues | P0/P1 | 🔄 In progress |
| Performance Targets | All met | ⏳ Sprint 9 |
| Security Audit | Passed | ⏳ To schedule |
| Beta Users | 50+ | ⏳ To recruit |

---

**Status**: Planning complete, documentation 80% complete  
**Remaining**: Quick start polish, API reference, final security audit  
**Timeline**: 2 weeks once Sprint 9 complete

