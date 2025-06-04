# ClipDesk 📋

A beautiful, local-first clipboard manager for Mac, Windows, and Linux inspired by Things app design and pasteapp.io functionality.

![ClipDesk Screenshot](https://via.placeholder.com/800x500/007AFF/FFFFFF?text=ClipDesk+Screenshot)

## ✨ Features

### 🎯 **Core Functionality**
- **📋 Clipboard History** - Automatically saves all copied text, images, files, and links
- **🔍 Smart Search** - Find anything in your clipboard history instantly
- **⭐ Favorites** - Mark important items to keep them forever
- **🏷️ Tags & Organization** - Categorize and organize your clipboard items
- **📝 Text Snippets** - Save and reuse frequently used text snippets
- **🔒 Sensitive Data Detection** - Automatically identifies and handles passwords/credit cards

### 🎨 **Beautiful Design**
- **Things-inspired UI** - Clean, modern interface with attention to detail
- **🌙 Dark/Light Mode** - Seamless theme switching
- **📱 Native Feel** - Platform-native design on macOS, Windows, and Linux
- **⚡ Smooth Animations** - Fluid transitions and micro-interactions

### 🔄 **Hybrid App Behavior**
- **🔧 Menubar Integration** - Always accessible from system tray
- **⌨️ Global Shortcuts** - `Cmd+Shift+V` to open instantly
- **🚀 Launch at Login** - Start automatically when you log in
- **👻 Dock Management** - Hides from dock when closed, stays in menubar

### 🔄 **Auto-Updates**
- **📦 Automatic Updates** - Users get new versions automatically
- **🔔 Smart Notifications** - Non-intrusive update prompts
- **📝 Release Notes** - View what's new in each update
- **⬇️ Background Downloads** - Updates download silently
- **🔄 One-Click Install** - Restart to install updates

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ 
- **npm** or **yarn**
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/clipdesk.git
cd clipdesk

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Start development server
npm run electron:dev
```

The app will open automatically and start monitoring your clipboard!

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev                    # Start Vite dev server
npm run electron:dev          # Start app in development mode

# Building
npm run build                 # Build for production
npm run build:debug          # Build without packaging
npm run build:mac            # Build for macOS only
npm run build:win            # Build for Windows only
npm run build:linux          # Build for Linux only

# Database
npm run prisma:generate       # Generate Prisma client
npm run prisma:migrate        # Run database migrations

# Code Quality
npm run lint                  # Run ESLint
npm run format               # Format code with Prettier
npm run type-check           # Check TypeScript types
npm run test                 # Run tests
```

### Project Structure

```
clipdesk/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts         # Main entry point
│   │   ├── autoUpdater.ts   # Auto-update functionality
│   │   └── clipboardMonitor.ts # Clipboard monitoring
│   ├── preload/             # Electron preload scripts
│   │   └── index.ts         # IPC API definitions
│   ├── renderer/            # React frontend
│   │   ├── App.tsx          # Main React component
│   │   └── components/      # UI components
│   └── shared/              # Shared utilities
│       └── database.ts      # Database layer
├── assets/                  # App icons and resources
├── prisma/                  # Database schema
└── dist/                    # Built files
```

## 🔄 Auto-Updates & Releases

### How Auto-Updates Work

ClipDesk uses **electron-updater** with **GitHub Releases** for professional-grade automatic updates:

#### **For Users:**
1. ✅ App automatically checks for updates on startup
2. ✅ Notification appears when update is available  
3. ✅ User can download, view release notes, or skip
4. ✅ Downloads update in background with progress
5. ✅ Prompts to restart when ready
6. ✅ Seamless installation on restart

#### **For Developers:**
1. ✅ Create GitHub release with version tag
2. ✅ GitHub Actions builds for all platforms automatically
3. ✅ Uploads installers to GitHub Releases
4. ✅ Users get notified and can update

### Publishing Updates

#### **Method 1: Automatic (Recommended)**
```bash
# Update version and create tag
npm version patch    # Bug fixes (0.1.0 → 0.1.1)
npm version minor    # New features (0.1.1 → 0.2.0)  
npm version major    # Breaking changes (0.2.0 → 1.0.0)

# Push to trigger release
git push origin main --tags
```

#### **Method 2: Manual GitHub Release**
1. Go to GitHub → Releases → "Create a new release"
2. Create tag: `v1.0.1`
3. GitHub Actions will build automatically

#### **Method 3: Direct Build & Publish**
```bash
npm run release         # Build and publish all platforms
npm run publish:mac     # Publish macOS only
npm run publish:win     # Publish Windows only
npm run publish:all     # Publish all platforms
```

### ⚠️ Important: Regular Pushes vs Releases

```bash
# ❌ This will NOT trigger updates for users (safe for development)
git add .
git commit -m "fix bug"
git push origin main

# ✅ This WILL trigger updates for users (when you're ready to release)
npm version patch
git push origin main --tags
```

This gives you **full control** over when users receive updates while allowing frequent development.

## 🔧 Configuration

### Repository Setup

1. **Update package.json** with your GitHub details:
```json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "YOUR_GITHUB_USERNAME",
        "repo": "clipdesk"
      }
    ]
  }
}
```

2. **GitHub Actions Secrets** (Optional - for code signing):
   - `MAC_CERTS`: Base64 encoded .p12 certificate
   - `MAC_CERTS_PASSWORD`: Certificate password
   - `APPLE_ID`: Your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password
   - `APPLE_TEAM_ID`: Your Apple Developer Team ID

### App Settings

Users can configure:
- **🚀 Launch at Login** - Start automatically
- **📋 History Retention** - How long to keep clipboard items
- **🔔 Notifications** - Update and clipboard notifications
- **🎨 Theme** - Dark/Light mode preference
- **🔧 Menubar Mode** - Always run in background

## 🏗️ Build System

### Multi-Platform Support

ClipDesk builds for all major platforms:

- **🍎 macOS**: DMG and ZIP (Universal: Intel + Apple Silicon)
- **🪟 Windows**: NSIS Installer and ZIP (x64 + x86)
- **🐧 Linux**: AppImage and tar.gz (x64)

### Build Targets

```json
{
  "mac": {
    "target": [
      { "target": "dmg", "arch": ["x64", "arm64"] },
      { "target": "zip", "arch": ["x64", "arm64"] }
    ]
  },
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64", "ia32"] },
      { "target": "zip", "arch": ["x64", "ia32"] }
    ]
  },
  "linux": {
    "target": [
      { "target": "AppImage", "arch": ["x64"] },
      { "target": "tar.gz", "arch": ["x64"] }
    ]
  }
}
```

## 🔒 Security & Privacy

### Local-First Architecture
- **🏠 Local Database** - All data stored locally using SQLite
- **🔒 No Cloud Sync** - Your clipboard data never leaves your device
- **🛡️ Sensitive Data Protection** - Automatic detection of passwords/credit cards
- **🔐 Secure Updates** - Cryptographically signed updates

### Code Signing (Recommended)

For production releases, code signing prevents security warnings:

- **macOS**: Requires Apple Developer account ($99/year)
- **Windows**: Requires code signing certificate
- **Benefits**: Users won't see "untrusted developer" warnings

## 📊 Tech Stack

### Core Technologies
- **⚡ Electron** - Cross-platform desktop framework
- **⚛️ React** - Frontend UI framework  
- **📘 TypeScript** - Type-safe development
- **🎨 Styled Components** - CSS-in-JS styling
- **🗄️ Prisma + SQLite** - Local database management

### Build & Deploy
- **📦 Electron Builder** - Application packaging
- **🔄 electron-updater** - Automatic updates
- **🤖 GitHub Actions** - CI/CD automation
- **📂 GitHub Releases** - Distribution platform

### Development Tools
- **⚡ Vite** - Fast build tool and dev server
- **🔍 ESLint** - Code linting
- **💅 Prettier** - Code formatting
- **🧪 Vitest** - Unit testing framework

## 🎯 Roadmap

### Near Term
- [ ] **📱 Mobile Companion** - iOS/Android apps for clipboard sync
- [ ] **🔗 Browser Extension** - Seamless web integration
- [ ] **🤖 Smart Categorization** - AI-powered clipboard organization
- [ ] **📊 Usage Analytics** - Clipboard usage insights

### Future
- [ ] **☁️ Optional Cloud Sync** - Cross-device clipboard sync
- [ ] **🔌 Plugin System** - Third-party integrations
- [ ] **📝 Advanced Snippets** - Variables, scripts, and templates
- [ ] **🎨 Custom Themes** - User-customizable appearances

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. **Fork and clone** the repository
2. **Install dependencies**: `npm install`
3. **Start development**: `npm run electron:dev`
4. **Make changes** and test thoroughly
5. **Submit pull request** with clear description

### Code Style

- **TypeScript** for all new code
- **ESLint + Prettier** for formatting
- **Conventional Commits** for commit messages
- **Component tests** for new UI features

## 📄 License

This project is licensed under the **Commercial License**. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **Things by Cultured Code** - Design inspiration
- **Pasteapp.io** - Functionality inspiration  
- **Electron Community** - Excellent documentation and tools
- **GitHub** - Free hosting and CI/CD platform

## 📞 Support

- **🐛 Bug Reports**: [GitHub Issues](https://github.com/your-username/clipdesk/issues)
- **💡 Feature Requests**: [GitHub Discussions](https://github.com/your-username/clipdesk/discussions)
- **📧 Email**: support@clipdesk.app
- **🐦 Twitter**: [@ClipDeskApp](https://twitter.com/ClipDeskApp)

---

<div align="center">

**Made with ❤️ for productivity enthusiasts**

[Website](https://clipdesk.app) • [Download](https://github.com/your-username/clipdesk/releases) • [Documentation](https://docs.clipdesk.app)

</div>