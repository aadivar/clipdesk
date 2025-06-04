import React, { useState, useEffect, createContext, useContext } from 'react'
import styled, { ThemeProvider, createGlobalStyle } from 'styled-components'
import { SensitiveDataIndicator, SensitiveDataSettings } from './components/SensitiveDataIndicator'
import UpdateNotification from './components/UpdateNotification'

// Things-inspired theme definitions
const lightTheme = {
  colors: {
    // Main backgrounds
    background: '#ffffff',
    sidebarBg: '#f7f7f7',
    sidebarBorder: '#e8e8e8',

    // Text colors
    text: '#1d1d1f',
    textSecondary: '#86868b',
    textTertiary: '#c7c7cc',

    // Accent colors
    accent: '#007aff',
    accentHover: '#0056cc',
    accentLight: '#e3f2fd',

    // Borders and dividers
    border: '#e8e8e8',
    borderLight: '#f2f2f7',

    // Item backgrounds
    itemBg: '#ffffff',
    itemHover: '#f8f9fa',
    itemSelected: '#e3f2fd',

    // Search and input
    searchBg: '#f2f2f7',
    searchBorder: '#e8e8e8',
    searchFocus: '#007aff',

    // Shadows and overlays
    shadow: 'rgba(0, 0, 0, 0.04)',
    shadowHover: 'rgba(0, 0, 0, 0.08)',
    overlay: 'rgba(0, 0, 0, 0.3)',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif',
    fontFamilyMono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    xxxl: '32px',
  },
  borderRadius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  }
}

const darkTheme = {
  colors: {
    // Main backgrounds
    background: '#1c1c1e',
    sidebarBg: '#2c2c2e',
    sidebarBorder: '#38383a',

    // Text colors
    text: '#ffffff',
    textSecondary: '#98989d',
    textTertiary: '#636366',

    // Accent colors
    accent: '#0a84ff',
    accentHover: '#409cff',
    accentLight: 'rgba(10, 132, 255, 0.15)',

    // Borders and dividers
    border: '#38383a',
    borderLight: '#48484a',

    // Item backgrounds
    itemBg: '#2c2c2e',
    itemHover: '#3a3a3c',
    itemSelected: 'rgba(10, 132, 255, 0.15)',

    // Search and input
    searchBg: '#3a3a3c',
    searchBorder: '#48484a',
    searchFocus: '#0a84ff',

    // Shadows and overlays
    shadow: 'rgba(0, 0, 0, 0.3)',
    shadowHover: 'rgba(0, 0, 0, 0.4)',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif',
    fontFamilyMono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    xxxl: '32px',
  },
  borderRadius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  }
}

const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    background-color: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.text};
    font-family: ${props => props.theme.typography.fontFamily};
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Scrollbar styling for webkit browsers */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.textTertiary};
    border-radius: 4px;
    opacity: 0.5;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${props => props.theme.colors.textSecondary};
    opacity: 0.8;
  }

  /* Focus styles */
  *:focus {
    outline: none;
  }

  /* Selection styles */
  ::selection {
    background: ${props => props.theme.colors.accentLight};
    color: ${props => props.theme.colors.text};
  }
`

// Theme Context
const ThemeContext = createContext<{
  isDark: boolean
  toggleTheme: () => void
}>({
  isDark: false,
  toggleTheme: () => {}
})

// Styled components with Things-inspired design
const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: ${props => props.theme.colors.background};
  font-family: ${props => props.theme.typography.fontFamily};
  overflow: hidden;
`

const Sidebar = styled.div`
  width: 280px;
  background-color: ${props => props.theme.colors.sidebarBg};
  border-right: 1px solid ${props => props.theme.colors.sidebarBorder};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

  /* Subtle inner shadow for depth */
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(
      to bottom,
      ${props => props.theme.colors.shadow},
      transparent 50%,
      ${props => props.theme.colors.shadow}
    );
    pointer-events: none;
  }
`

const SidebarHeader = styled.div`
  padding: ${props => props.theme.spacing.xxxl} ${props => props.theme.spacing.xxl} ${props => props.theme.spacing.lg};
  border-bottom: 1px solid ${props => props.theme.colors.sidebarBorder};
  background-color: ${props => props.theme.colors.sidebarBg};
  -webkit-app-region: drag; /* Make this area draggable on macOS */

  h1 {
    font-size: 20px;
    font-weight: 700;
    color: ${props => props.theme.colors.text};
    margin: 0;
    display: flex;
    align-items: center;
    gap: ${props => props.theme.spacing.sm};
    letter-spacing: -0.01em;
    -webkit-app-region: no-drag; /* Prevent text selection conflicts */

    /* Emoji styling */
    .emoji {
      font-size: 18px;
      filter: drop-shadow(0 1px 2px ${props => props.theme.colors.shadow});
    }
  }
`

const SidebarContent = styled.div`
  flex: 1;
  padding: ${props => props.theme.spacing.lg} 0;
  overflow-y: auto;
  -webkit-app-region: no-drag; /* Allow sidebar interactions */

  /* Custom scrollbar for sidebar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin: ${props => props.theme.spacing.sm} 0;
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.textTertiary};
    border-radius: 3px;
    opacity: 0.3;
  }

  &::-webkit-scrollbar-thumb:hover {
    opacity: 0.6;
  }
`

const SidebarSection = styled.div`
  margin-bottom: ${props => props.theme.spacing.xxl};

  &:last-child {
    margin-bottom: 0;
  }
`

const SidebarItem = styled.div<{ isActive?: boolean }>`
  padding: ${props => props.theme.spacing.md} ${props => props.theme.spacing.xxl};
  margin: 0 ${props => props.theme.spacing.md};
  cursor: pointer;
  color: ${props => props.isActive ? props.theme.colors.accent : props.theme.colors.text};
  background-color: ${props => props.isActive ? props.theme.colors.itemSelected : 'transparent'};
  font-weight: ${props => props.isActive ? '600' : '500'};
  font-size: 14px;
  line-height: 1.4;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.md};
  border-radius: ${props => props.theme.borderRadius.md};
  position: relative;

  &:hover {
    background-color: ${props => props.isActive ?
      props.theme.colors.itemSelected :
      props.theme.colors.itemHover};
    transform: translateX(1px);
  }

  /* Active indicator */
  ${props => props.isActive && `
    &::before {
      content: '';
      position: absolute;
      left: -${props.theme.spacing.md};
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 20px;
      background: ${props.theme.colors.accent};
      border-radius: 0 2px 2px 0;
    }
  `}

  .icon {
    font-size: 16px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: ${props => props.isActive ? '1' : '0.8'};
  }

  .label {
    flex: 1;
    font-weight: inherit;
    letter-spacing: -0.01em;
  }

  .count {
    font-size: 12px;
    color: ${props => props.theme.colors.textSecondary};
    font-weight: 600;
    background: ${props => props.theme.colors.borderLight};
    padding: 2px 6px;
    border-radius: 10px;
    min-width: 20px;
    text-align: center;
    line-height: 1.2;
  }
`

const SidebarFooter = styled.div`
  padding: ${props => props.theme.spacing.lg} ${props => props.theme.spacing.xxl};
  border-top: 1px solid ${props => props.theme.colors.sidebarBorder};
  background-color: ${props => props.theme.colors.sidebarBg};
  -webkit-app-region: no-drag; /* Allow footer interactions */
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.xs};
`

const FooterButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.md};
  width: 100%;
  padding: ${props => props.theme.spacing.md};
  background: none;
  border: none;
  color: ${props => props.theme.colors.text};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: ${props => props.theme.borderRadius.md};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;

  &:hover {
    background-color: ${props => props.theme.colors.itemHover};
    transform: translateX(1px);
  }

  &:active {
    transform: translateX(0);
    background-color: ${props => props.theme.colors.itemSelected};
  }

  .icon {
    font-size: 16px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .label {
    flex: 1;
    letter-spacing: -0.01em;
  }
`

const ThemeToggle = styled(FooterButton)`
  /* Inherits all styles from FooterButton */
`

const SettingsButton = styled(FooterButton)`
  /* Inherits all styles from FooterButton */
`

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: ${props => props.theme.colors.background};
  position: relative;
`

const SearchBar = styled.div`
  padding: ${props => props.theme.spacing.xxxl} ${props => props.theme.spacing.xxl} ${props => props.theme.spacing.xl};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background-color: ${props => props.theme.colors.background};
  -webkit-app-region: drag; /* Make this area draggable on macOS */
  position: relative;
  z-index: 10;

  /* Subtle shadow for depth */
  box-shadow: 0 1px 0 0 ${props => props.theme.colors.shadow};
`

const SearchInputContainer = styled.div`
  position: relative;
  max-width: 600px;

  /* Search icon */
  &::before {
    content: '🔍';
    position: absolute;
    left: ${props => props.theme.spacing.lg};
    top: 50%;
    transform: translateY(-50%);
    font-size: 14px;
    opacity: 0.6;
    pointer-events: none;
    z-index: 1;
  }
`

const SearchInput = styled.input`
  width: 100%;
  padding: ${props => props.theme.spacing.lg} ${props => props.theme.spacing.lg} ${props => props.theme.spacing.lg} 40px;
  border: 1px solid ${props => props.theme.colors.searchBorder};
  border-radius: ${props => props.theme.borderRadius.lg};
  font-size: 15px;
  font-weight: 400;
  background-color: ${props => props.theme.colors.searchBg};
  color: ${props => props.theme.colors.text};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag; /* Allow input interaction */
  font-family: ${props => props.theme.typography.fontFamily};
  line-height: 1.4;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.searchFocus};
    background-color: ${props => props.theme.colors.background};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.accentLight};
    transform: translateY(-1px);
  }

  &::placeholder {
    color: ${props => props.theme.colors.textSecondary};
    font-weight: 400;
  }

  /* Remove autofill styling */
  &:-webkit-autofill,
  &:-webkit-autofill:hover,
  &:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px ${props => props.theme.colors.searchBg} inset;
    -webkit-text-fill-color: ${props => props.theme.colors.text};
    transition: background-color 5000s ease-in-out 0s;
  }
`

const FilterContainer = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.md};
  align-items: center;
  margin-top: ${props => props.theme.spacing.md};
`

const FilterSelect = styled.select`
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  border: 1px solid ${props => props.theme.colors.searchBorder};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 14px;
  font-weight: 400;
  background-color: ${props => props.theme.colors.searchBg};
  color: ${props => props.theme.colors.text};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;
  font-family: ${props => props.theme.typography.fontFamily};
  cursor: pointer;
  min-width: 150px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.searchFocus};
    background-color: ${props => props.theme.colors.background};
    box-shadow: 0 0 0 2px ${props => props.theme.colors.accentLight};
  }

  &:hover {
    border-color: ${props => props.theme.colors.searchFocus};
  }
`

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${props => props.theme.colors.textSecondary};
  white-space: nowrap;
`

const ContentArea = styled.div`
  flex: 1;
  padding: ${props => props.theme.spacing.xl} ${props => props.theme.spacing.xxl};
  overflow-y: auto;
  background-color: ${props => props.theme.colors.background};
  -webkit-app-region: no-drag; /* Allow content interactions */

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin: ${props => props.theme.spacing.sm} 0;
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.textTertiary};
    border-radius: 4px;
    opacity: 0.4;
  }

  &::-webkit-scrollbar-thumb:hover {
    opacity: 0.7;
  }
`

const WelcomeMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: ${props => props.theme.colors.textSecondary};
  padding: ${props => props.theme.spacing.xxxl};

  h2 {
    font-size: 28px;
    font-weight: 600;
    margin-bottom: ${props => props.theme.spacing.lg};
    color: ${props => props.theme.colors.text};
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  p {
    font-size: 16px;
    line-height: 1.6;
    max-width: 480px;
    font-weight: 400;
    opacity: 0.8;
  }

  /* Add a subtle icon or illustration */
  &::before {
    content: '📋';
    font-size: 48px;
    margin-bottom: ${props => props.theme.spacing.xl};
    opacity: 0.6;
    filter: grayscale(0.3);
  }
`

const ClipboardItem = styled.div`
  padding: ${props => props.theme.spacing.xl};
  margin-bottom: ${props => props.theme.spacing.lg};
  background-color: ${props => props.theme.colors.itemBg};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.lg};
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  box-shadow: 0 1px 3px ${props => props.theme.colors.shadow};

  &:hover {
    border-color: ${props => props.theme.colors.accent};
    box-shadow:
      0 4px 20px ${props => props.theme.colors.shadowHover},
      0 0 0 1px ${props => props.theme.colors.accent}20;
    transform: translateY(-2px);

    .favorite-btn {
      opacity: 1;
    }

    .actions {
      opacity: 1;
      transform: translateX(0);
    }
  }

  &:active {
    transform: translateY(-1px);
    transition: transform 0.1s ease;
  }

  .preview {
    margin-bottom: ${props => props.theme.spacing.md};
    border-radius: ${props => props.theme.borderRadius.md};
    overflow: hidden;
  }

  .content {
    font-size: 15px;
    color: ${props => props.theme.colors.text};
    margin-bottom: ${props => props.theme.spacing.sm};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    line-height: 1.4;
    letter-spacing: -0.01em;
  }

  .meta {
    font-size: 13px;
    color: ${props => props.theme.colors.textSecondary};
    font-weight: 400;
    display: flex;
    align-items: center;
    gap: ${props => props.theme.spacing.md};

    .type-badge {
      background: ${props => props.theme.colors.borderLight};
      color: ${props => props.theme.colors.textSecondary};
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .source-app {
      opacity: 0.7;
    }

    .timestamp {
      margin-left: auto;
      opacity: 0.6;
    }
  }
`

const FavoriteButton = styled.button`
  position: absolute;
  top: ${props => props.theme.spacing.lg};
  right: ${props => props.theme.spacing.lg};
  background: ${props => props.theme.colors.itemBg};
  border: 1px solid ${props => props.theme.colors.border};
  cursor: pointer;
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.sm};
  color: ${props => props.theme.colors.textSecondary};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;
  font-size: 14px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px ${props => props.theme.colors.shadow};

  &:hover {
    background-color: ${props => props.theme.colors.itemHover};
    border-color: ${props => props.theme.colors.accent};
    color: ${props => props.theme.colors.accent};
    opacity: 1;
    transform: scale(1.05);
    box-shadow: 0 4px 12px ${props => props.theme.colors.shadowHover};
  }

  &.is-favorite {
    opacity: 1;
    color: #FFD700;
    background: rgba(255, 215, 0, 0.1);
    border-color: rgba(255, 215, 0, 0.3);
  }

  &.is-favorite:hover {
    color: #FFA500;
    background: rgba(255, 165, 0, 0.15);
    border-color: rgba(255, 165, 0, 0.4);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`

const ImagePreview = styled.img`
  max-width: 100%;
  max-height: 140px;
  border-radius: ${props => props.theme.borderRadius.md};
  object-fit: cover;
  display: block;
  box-shadow: 0 2px 8px ${props => props.theme.colors.shadow};
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.02);
  }
`

const LinkPreview = styled.div`
  background: ${props => props.theme.colors.itemHover};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.accent};
    box-shadow: 0 2px 8px ${props => props.theme.colors.shadow};
  }

  .link-title {
    font-weight: 600;
    color: ${props => props.theme.colors.text};
    margin-bottom: ${props => props.theme.spacing.xs};
    font-size: 14px;
    line-height: 1.4;
    letter-spacing: -0.01em;
  }

  .link-url {
    font-size: 12px;
    color: ${props => props.theme.colors.accent};
    text-decoration: none;
    font-weight: 500;
    opacity: 0.8;

    &:hover {
      text-decoration: underline;
      opacity: 1;
    }
  }
`

const FilePreview = styled.div`
  background: ${props => props.theme.colors.itemHover};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: ${props => props.theme.spacing.lg};
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.accent};
    box-shadow: 0 2px 8px ${props => props.theme.colors.shadow};
  }

  .file-icon {
    font-size: 24px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${props => props.theme.colors.accentLight};
    border-radius: ${props => props.theme.borderRadius.md};
    color: ${props => props.theme.colors.accent};
    font-weight: 600;
  }

  .file-info {
    flex: 1;
    min-width: 0; /* Allow text truncation */

    .file-name {
      font-weight: 600;
      color: ${props => props.theme.colors.text};
      margin-bottom: ${props => props.theme.spacing.xs};
      font-size: 14px;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.01em;
    }

    .file-details {
      font-size: 12px;
      color: ${props => props.theme.colors.textSecondary};
      font-weight: 500;
    }
  }
`

const ColorPreview = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.lg};

  .color-swatch {
    width: 44px;
    height: 44px;
    border-radius: ${props => props.theme.borderRadius.md};
    border: 1px solid ${props => props.theme.colors.border};
    box-shadow: 0 2px 8px ${props => props.theme.colors.shadow};
    position: relative;
    overflow: hidden;

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    }
  }

  .color-info {
    flex: 1;

    .color-value {
      font-family: ${props => props.theme.typography.fontFamilyMono};
      font-weight: 600;
      color: ${props => props.theme.colors.text};
      font-size: 14px;
      margin-bottom: ${props => props.theme.spacing.xs};
      letter-spacing: -0.01em;
    }

    .color-format {
      font-size: 12px;
      color: ${props => props.theme.colors.textSecondary};
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }
`

const CodePreview = styled.pre`
  background: ${props => props.theme.colors.itemHover};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: ${props => props.theme.spacing.lg};
  margin: 0;
  font-family: ${props => props.theme.typography.fontFamilyMono};
  font-size: 13px;
  line-height: 1.5;
  color: ${props => props.theme.colors.text};
  overflow-x: auto;
  max-height: 140px;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.accent};
    box-shadow: 0 2px 8px ${props => props.theme.colors.shadow};
  }

  /* Syntax highlighting */
  .keyword { color: ${props => props.theme.colors.accent}; font-weight: 600; }
  .string { color: #32d74b; }
  .comment { color: ${props => props.theme.colors.textSecondary}; font-style: italic; opacity: 0.8; }
  .number { color: #ff9f0a; font-weight: 500; }
  .function { color: #af52de; }
  .variable { color: ${props => props.theme.colors.text}; }
`

const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #8e8e93;
  font-size: 14px;
`

const SettingsContainer = styled.div`
  padding: 20px;
  max-width: 600px;
  
  h2 {
    font-size: 24px;
    font-weight: 600;
    color: ${props => props.theme.colors.text};
    margin-bottom: 24px;
  }
`

const SettingsSection = styled.div`
  margin-bottom: 32px;
  
  h3 {
    font-size: 18px;
    font-weight: 500;
    color: ${props => props.theme.colors.text};
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${props => props.theme.colors.border};
  }
`

const SettingsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  
  &:last-child {
    border-bottom: none;
  }
`

const SettingsLabel = styled.div`
  display: flex;
  flex-direction: column;
  
  .label {
    font-size: 14px;
    font-weight: 500;
    color: ${props => props.theme.colors.text};
    margin-bottom: 2px;
  }
  
  .description {
    font-size: 12px;
    color: ${props => props.theme.colors.textSecondary};
  }
`

const SettingsControl = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const Select = styled.select`
  padding: 6px 12px;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  font-size: 14px;
  background-color: ${props => props.theme.colors.itemBg};
  color: ${props => props.theme.colors.text};
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.accent}20;
  }
`

const Button = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 8px 16px;
  border: 1px solid ${props => 
    props.variant === 'danger' ? '#ff4757' : 
    props.variant === 'primary' ? props.theme.colors.accent : props.theme.colors.border
  };
  border-radius: 6px;
  background-color: ${props => 
    props.variant === 'danger' ? '#ff4757' : 
    props.variant === 'primary' ? props.theme.colors.accent : props.theme.colors.itemBg
  };
  color: ${props => 
    props.variant === 'danger' || props.variant === 'primary' ? '#ffffff' : props.theme.colors.text
  };
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    opacity: 0.8;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const Toggle = styled.input.attrs({ type: 'checkbox' })`
  position: relative;
  width: 44px;
  height: 24px;
  appearance: none;
  background-color: ${props => props.theme.colors.border};
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  &:checked {
    background-color: ${props => props.theme.colors.accent};
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    transform: ${props => props.checked ? 'translateX(20px)' : 'translateX(0)'};
  }
`

interface ClipboardItemData {
  id: string
  content: string
  contentType: 'text' | 'image' | 'file' | 'link' | 'color'
  sourceApp?: string
  createdAt: string
  accessedAt: string
  accessCount: number
  isFavorite: boolean
  isSensitive?: boolean
  sensitiveTypes?: string[]
  sensitiveConfidence?: 'low' | 'medium' | 'high'
  tags?: any[]
  metadata?: any
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSourceApp, setSelectedSourceApp] = useState<string>('all')
  const [availableSourceApps, setAvailableSourceApps] = useState<string[]>([])
  const [clipboardItems, setClipboardItems] = useState<ClipboardItemData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [showSensitiveDataSettings, setShowSensitiveDataSettings] = useState(false)
  const [settings, setSettings] = useState({
    retentionDays: '30',
    maxHistoryItems: '1000',
    autoStartup: 'true',
    soundEnabled: 'true',
    runInMenubar: 'true', // Default to true for hybrid mode
    showInDock: 'false',  // Default to false for hybrid mode
    launchAtLogin: 'false'
  })

  const toggleTheme = () => {
    setIsDark(prev => !prev)
  }

  const themeContextValue = {
    isDark,
    toggleTheme
  }

  useEffect(() => {
    // Initialize the app with retry mechanism
    const initializeApp = async () => {
      const maxRetries = 5
      const retryDelay = 1000 // 1 second

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔧 App initialization attempt ${attempt}/${maxRetries}`)

          // Wait a bit for IPC handlers to be ready
          if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
          }

          // Load settings
          if (window.clipdesk) {
            console.log('🔧 Loading settings...')
            const [retentionDays, maxHistoryItems, autoStartup, soundEnabled, runInMenubar, showInDock, launchAtLogin] = await Promise.all([
              window.clipdesk.settings.get('retentionDays'),
              window.clipdesk.settings.get('maxHistoryItems'),
              window.clipdesk.settings.get('autoStartup'),
              window.clipdesk.settings.get('soundEnabled'),
              window.clipdesk.settings.get('runInMenubar'),
              window.clipdesk.settings.get('showInDock'),
              window.clipdesk.settings.get('launchAtLogin')
            ])

            setSettings({
              retentionDays: retentionDays || '30',
              maxHistoryItems: maxHistoryItems || '1000',
              autoStartup: autoStartup || 'true',
              soundEnabled: soundEnabled || 'true',
              runInMenubar: runInMenubar || 'true',  // Default to true for hybrid mode
              showInDock: showInDock || 'false',     // Default to false for hybrid mode
              launchAtLogin: launchAtLogin || 'false'
            })
            console.log('✅ Settings loaded successfully')
          }

          // Load clipboard history
          if (window.clipdesk) {
            console.log('🔧 Loading clipboard history...')
            const history = await window.clipdesk.clipboard.getHistory({ limit: 100 })
            console.log('✅ Loaded history:', history?.length || 0, 'items')
            setClipboardItems(history || [])

            // Load available source apps
            console.log('🔧 Loading source apps...')
            const sourceApps = await window.clipdesk.clipboard.getSourceApps()
            console.log('✅ Loaded source apps:', sourceApps?.length || 0, 'apps')
            setAvailableSourceApps(sourceApps || [])
          } else {
            setError('ClipDesk API not available')
          }

          // If we get here, initialization was successful
          console.log('✅ App initialization completed successfully')
          break

        } catch (error) {
          console.error(`❌ App initialization attempt ${attempt} failed:`, error)

          if (attempt === maxRetries) {
            console.error('❌ All initialization attempts failed')
            setError('Failed to load clipboard history')
          } else {
            console.log(`⏳ Retrying in ${retryDelay}ms...`)
          }
        }
      }

      setIsLoading(false)
    }

    // Add a small initial delay to ensure main process is ready
    setTimeout(initializeApp, 500)

    // Listen for clipboard updates
    if (window.clipdesk) {
      const handleClipboardChange = (data: any) => {
        console.log('🎯 Raw clipboard event received in React:', data)
        
        try {
          // Validate that we have actual data from the database
          if (!data || !data.id || !data.content || data.content.trim() === '') {
            console.log('❌ Received empty or invalid clipboard data, skipping')
            return
          }
          
          // Use the database item directly (it's already in the correct format)
          const newItem: ClipboardItemData = {
            id: data.id,
            content: data.content,
            contentType: data.contentType,
            sourceApp: data.sourceApp || 'Unknown',
            createdAt: data.createdAt,
            accessedAt: data.accessedAt,
            accessCount: data.accessCount || 1,
            isFavorite: data.isFavorite || false,
            tags: data.tags || [],
            metadata: data.metadata
          }
          
          console.log('✅ Adding new clipboard item to React state:', {
            id: newItem.id,
            type: newItem.contentType,
            source: newItem.sourceApp,
            content: newItem.content.substring(0, 50) + '...'
          })
          
          setClipboardItems(prev => {
            // Check for duplicates by ID to prevent double entries
            const isDuplicate = prev.some(item => item.id === newItem.id)

            if (isDuplicate) {
              console.log('⚠️ Duplicate item detected, skipping')
              return prev
            }

            console.log('🔄 Updating clipboard items state, new count will be:', prev.length + 1)
            return [newItem, ...prev]
          })

          // Update source apps list if we have a new source app
          if (newItem.sourceApp && newItem.sourceApp !== 'Unknown') {
            setAvailableSourceApps(prev => {
              if (!prev.includes(newItem.sourceApp!)) {
                return [...prev, newItem.sourceApp!].sort()
              }
              return prev
            })
          }
        } catch (err) {
          console.error('❌ Error processing clipboard change:', err)
          console.error('Problematic data:', data)
        }
      }

      console.log('🔗 Setting up clipboard-changed event listener')
      window.clipdesk.on('clipboard-changed', handleClipboardChange)

      // Add debug log listener to see main process messages
      const handleDebugLog = (message: string) => {
        console.log('🔧 Main Process:', message)
      }
      
      console.log('🔗 Setting up debug-log event listener')
      window.clipdesk.on('debug-log', handleDebugLog)

      return () => {
        console.log('🔌 Removing clipboard-changed event listener')
        window.clipdesk.off('clipboard-changed', handleClipboardChange)
        console.log('🔌 Removing debug-log event listener')
        window.clipdesk.off('debug-log', handleDebugLog)
      }
    } else {
      console.error('❌ window.clipdesk not available for event listeners')
    }
  }, [])

  const handleItemClick = async (item: ClipboardItemData) => {
    try {
      await window.clipdesk.clipboard.copyItem(item.content)
      console.log('Copied item to clipboard:', item.content.substring(0, 50) + '...')
    } catch (error) {
      console.error('Failed to copy item:', error)
    }
  }

  const handleToggleFavorite = async (item: ClipboardItemData, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent triggering the item click
    
    try {
      const updatedItem = await window.clipdesk.clipboard.toggleFavorite(item.id)
      
      // Update the local state with the returned item
      setClipboardItems(prev => 
        prev.map(prevItem => 
          prevItem.id === item.id 
            ? { ...prevItem, isFavorite: updatedItem.isFavorite }
            : prevItem
        )
      )
      
      console.log(`${updatedItem.isFavorite ? 'Added to' : 'Removed from'} favorites:`, item.content.substring(0, 50) + '...')
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }

  const handleSettingChange = async (key: string, value: string) => {
    try {
      await window.clipdesk.settings.set(key, value)
      setSettings(prev => ({ ...prev, [key]: value }))
      console.log(`Setting ${key} updated to:`, value)
    } catch (error) {
      console.error('Failed to update setting:', error)
    }
  }

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear all non-favorited clipboard history? This action cannot be undone.')) {
      try {
        await window.clipdesk.clipboard.clearHistory()
        // Reload clipboard items to reflect the changes
        const history = await window.clipdesk.clipboard.getHistory({ limit: 100 })
        setClipboardItems(history || [])

        // Reload source apps list
        const sourceApps = await window.clipdesk.clipboard.getSourceApps()
        setAvailableSourceApps(sourceApps || [])

        // Reset source app filter
        setSelectedSourceApp('all')

        console.log('Clipboard history cleared')
      } catch (error) {
        console.error('Failed to clear history:', error)
      }
    }
  }

  const handleClearEverything = async () => {
    if (window.confirm('Are you sure you want to clear ALL clipboard history including favorites? This action cannot be undone.')) {
      try {
        // First unfavorite all items, then clear
        for (const item of clipboardItems.filter(item => item.isFavorite)) {
          await window.clipdesk.clipboard.toggleFavorite(item.id)
        }
        await window.clipdesk.clipboard.clearHistory()
        setClipboardItems([])

        // Clear source apps list
        setAvailableSourceApps([])

        // Reset source app filter
        setSelectedSourceApp('all')

        console.log('All clipboard history cleared')
      } catch (error) {
        console.error('Failed to clear everything:', error)
      }
    }
  }

  const filteredItems = clipboardItems.filter(item => {
    const matchesSearch = item.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSourceApp = selectedSourceApp === 'all' || item.sourceApp === selectedSourceApp

    const baseFilter = matchesSearch && matchesSourceApp

    if (activeView === 'all') return baseFilter
    if (activeView === 'recent') {
      const now = Date.now()
      const recentlyCreated = now - new Date(item.createdAt).getTime() < 6 * 60 * 60 * 1000 // 6 hours
      const recentlyAccessed = now - new Date(item.accessedAt).getTime() < 24 * 60 * 60 * 1000 // 24 hours
      return baseFilter && (recentlyCreated || recentlyAccessed)
    }
    if (activeView === 'text') return baseFilter && item.contentType === 'text'
    if (activeView === 'images') return baseFilter && item.contentType === 'image'
    if (activeView === 'files') return baseFilter && item.contentType === 'file'
    if (activeView === 'links') return baseFilter && item.contentType === 'link'
    if (activeView === 'sensitive') return baseFilter && item.isSensitive
    if (activeView === 'favorites') return baseFilter && item.isFavorite

    return baseFilter
  })

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  const getContentPreview = (item: ClipboardItemData) => {
    if (item.contentType === 'image') {
      return `📷 Image (${item.metadata?.format || 'unknown format'})`
    }
    if (item.contentType === 'link') {
      return `🔗 ${item.metadata?.domain || item.content}`
    }
    if (item.contentType === 'color') {
      return `🎨 ${item.content}`
    }
    if (item.contentType === 'file') {
      return `📄 ${item.metadata?.fileName || 'File'}`
    }
    
    // Text content
    return item.content.length > 100 ? 
      item.content.substring(0, 100) + '...' : 
      item.content
  }

  const sidebarItems = [
    { id: 'all', label: 'All Items', icon: '📋', count: clipboardItems.length },
    { id: 'recent', label: 'Recent', icon: '🕒', count: clipboardItems.filter(item => {
      const now = Date.now()
      const recentlyCreated = now - new Date(item.createdAt).getTime() < 6 * 60 * 60 * 1000 // 6 hours
      const recentlyAccessed = now - new Date(item.accessedAt).getTime() < 24 * 60 * 60 * 1000 // 24 hours
      return recentlyCreated || recentlyAccessed
    }).length },
    { id: 'text', label: 'Text', icon: '📝', count: clipboardItems.filter(item => item.contentType === 'text').length },
    { id: 'images', label: 'Images', icon: '🖼️', count: clipboardItems.filter(item => item.contentType === 'image').length },
    { id: 'files', label: 'Files', icon: '📁', count: clipboardItems.filter(item => item.contentType === 'file').length },
    { id: 'links', label: 'Links', icon: '🔗', count: clipboardItems.filter(item => item.contentType === 'link').length },
    { id: 'sensitive', label: 'Sensitive', icon: '🔒', count: clipboardItems.filter(item => item.isSensitive).length },
    { id: 'favorites', label: 'Favorites', icon: '⭐', count: clipboardItems.filter(item => item.isFavorite).length },
  ]

  const currentTheme = isDark ? darkTheme : lightTheme

  const getFileIcon = (fileExt: string): string => {
    const ext = fileExt.toLowerCase().replace('.', '');
    
    // Apple iWork formats
    if (['key'].includes(ext)) return '📈'; // Keynote (presentation)
    if (['pages'].includes(ext)) return '📝'; // Pages (document)
    if (['numbers'].includes(ext)) return '📊'; // Numbers (spreadsheet)
    
    // Document types
    if (['pdf'].includes(ext)) return '📄';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx'].includes(ext)) return '📊';
    if (['ppt', 'pptx'].includes(ext)) return '📈';
    if (['txt', 'rtf'].includes(ext)) return '📄';
    if (['odt', 'ods', 'odp'].includes(ext)) return '📄'; // OpenOffice
    
    // Media types
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'tiff', 'tif', 'webp', 'ico', 'heic', 'heif', 'raw'].includes(ext)) return '🖼️';
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', 'f4v'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return '🎵';
    
    // Design files
    if (['psd', 'ai'].includes(ext)) return '🎨'; // Adobe
    if (['sketch'].includes(ext)) return '💎'; // Sketch
    if (['fig', 'figma'].includes(ext)) return '🎯'; // Figma
    if (['xd'].includes(ext)) return '🔷'; // Adobe XD
    if (['xcf'].includes(ext)) return '🐾'; // GIMP
    if (['blend'].includes(ext)) return '🔶'; // Blender
    
    // Code files
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) return '⚡';
    if (['html', 'htm'].includes(ext)) return '🌐';
    if (['css', 'scss', 'sass', 'less'].includes(ext)) return '🎨';
    if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return '📋';
    if (['py'].includes(ext)) return '🐍';
    if (['java'].includes(ext)) return '☕';
    if (['cpp', 'c', 'h'].includes(ext)) return '⚙️';
    if (['php'].includes(ext)) return '🐘';
    if (['rb'].includes(ext)) return '💎';
    if (['go'].includes(ext)) return '🐹';
    if (['rs'].includes(ext)) return '🦀';
    if (['swift'].includes(ext)) return '🦉';
    if (['vue'].includes(ext)) return '💚';
    if (['sql'].includes(ext)) return '🗄️';
    if (['sh', 'bat'].includes(ext)) return '⚡';
    
    // Archives
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return '📦';
    if (['dmg'].includes(ext)) return '💿'; // macOS disk image
    
    // Applications
    if (['exe', 'msi'].includes(ext)) return '⚙️'; // Windows
    if (['app'].includes(ext)) return '📱'; // macOS app
    if (['pkg', 'deb', 'rpm'].includes(ext)) return '📦'; // Package files
    
    // Books/Documents
    if (['epub', 'mobi', 'azw', 'azw3', 'fb2'].includes(ext)) return '📚';
    if (['torrent'].includes(ext)) return '🌊';
    
    return '📄'; // Default file icon
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderItemPreview = (item: ClipboardItemData) => {
    switch (item.contentType) {
      case 'image':
        return (
          <div className="preview">
            <ImagePreview 
              src={item.content} 
              alt="Clipboard image"
              onError={(e) => {
                // Hide image if it fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        );

      case 'link':
        let domain;
        try {
          domain = item.metadata?.domain || new URL(item.content).hostname;
        } catch (e) {
          domain = item.content.split('//')[1]?.split('/')[0] || 'Unknown domain';
        }
        
        return (
          <div className="preview">
            <LinkPreview>
              <div className="link-title">
                🔗 {domain}
              </div>
              <a href={item.content} className="link-url" target="_blank" rel="noopener noreferrer">
                {item.content.length > 60 ? item.content.substring(0, 60) + '...' : item.content}
              </a>
            </LinkPreview>
          </div>
        );

      case 'file':
        const fileName = item.metadata?.fileName || item.content.split('/').pop() || 'Unknown File';
        const fileExt = item.metadata?.fileType || '';
        const fileSize = item.metadata?.fileSize || 0;
        const exists = item.metadata?.exists !== false;
        
        return (
          <div className="preview">
            <FilePreview>
              <div className="file-icon">
                {getFileIcon(fileExt)}
              </div>
              <div className="file-info">
                <div className="file-name">{fileName}</div>
                <div className="file-details">
                  {fileExt.toUpperCase()} {fileSize > 0 && `• ${formatFileSize(fileSize)}`}
                  {!exists && ' • File not found'}
                </div>
              </div>
            </FilePreview>
          </div>
        );

      case 'color':
        const colorFormat = item.metadata?.colorFormat || 'unknown';
        return (
          <div className="preview">
            <ColorPreview>
              <div 
                className="color-swatch" 
                style={{ backgroundColor: item.content }}
              />
              <div className="color-info">
                <div className="color-value">{item.content}</div>
                <div className="color-format">{colorFormat.toUpperCase()}</div>
              </div>
            </ColorPreview>
          </div>
        );

      case 'text':
        // Show code preview for detected programming languages
        if (item.metadata?.language) {
          const previewCode = item.content.length > 300 ? 
            item.content.substring(0, 300) + '...' : 
            item.content;
          
          return (
            <div className="preview">
              <CodePreview>
                {previewCode}
              </CodePreview>
            </div>
          );
        }
        
        // For long text, show a preview
        if (item.content.length > 100) {
          return (
            <div className="preview">
              <div style={{
                background: currentTheme.colors.itemHover,
                border: `1px solid ${currentTheme.colors.border}`,
                borderRadius: '6px',
                padding: '12px',
                fontSize: '14px',
                lineHeight: '1.4',
                color: currentTheme.colors.text,
                maxHeight: '80px',
                overflow: 'hidden'
              }}>
                {item.content.substring(0, 200)}
                {item.content.length > 200 && '...'}
              </div>
            </div>
          );
        }
        
        return null; // No preview for short text

      default:
        return null;
    }
  };

  return (
    <ThemeProvider theme={currentTheme}>
      <ThemeContext.Provider value={themeContextValue}>
        <GlobalStyle />
        <AppContainer>
          <Sidebar>
            <SidebarHeader>
              <h1>
                <span className="emoji">📋</span>
                ClipDesk
              </h1>
            </SidebarHeader>

            <SidebarContent>
              <SidebarSection>
                {sidebarItems.map(item => (
                  <SidebarItem
                    key={item.id}
                    isActive={activeView === item.id}
                    onClick={() => setActiveView(item.id)}
                  >
                    <span className="icon">{item.icon}</span>
                    <span className="label">{item.label}</span>
                    <span className="count">{item.count}</span>
                  </SidebarItem>
                ))}
              </SidebarSection>
            </SidebarContent>

            <SidebarFooter>
              <ThemeToggle onClick={toggleTheme}>
                <span className="icon">{isDark ? '☀️' : '🌙'}</span>
                <span className="label">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
              </ThemeToggle>

              <SettingsButton onClick={() => setActiveView('settings')}>
                <span className="icon">⚙️</span>
                <span className="label">Settings</span>
              </SettingsButton>
            </SidebarFooter>
          </Sidebar>

          <MainContent>
            {activeView !== 'settings' && (
              <SearchBar>
                <SearchInputContainer>
                  <SearchInput
                    type="text"
                    placeholder="Search clipboard history..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </SearchInputContainer>

                {availableSourceApps.length > 0 && (
                  <FilterContainer>
                    <FilterLabel htmlFor="source-app-filter">Filter by app:</FilterLabel>
                    <FilterSelect
                      id="source-app-filter"
                      value={selectedSourceApp}
                      onChange={(e) => setSelectedSourceApp(e.target.value)}
                    >
                      <option value="all">All Apps</option>
                      {availableSourceApps.map(app => (
                        <option key={app} value={app}>{app}</option>
                      ))}
                    </FilterSelect>
                  </FilterContainer>
                )}
              </SearchBar>
            )}

            <ContentArea>
              {isLoading ? (
                <LoadingSpinner>Loading clipboard history...</LoadingSpinner>
              ) : error ? (
                <WelcomeMessage>
                  <h2>Error</h2>
                  <p>{error}</p>
                </WelcomeMessage>
              ) : activeView === 'settings' ? (
                <SettingsContainer>
                  <h2>Settings</h2>
                  
                  <SettingsSection>
                    <h3>History Management</h3>
                    
                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Keep history for</div>
                        <div className="description">Automatically delete items older than this period</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Select 
                          value={settings.retentionDays}
                          onChange={(e) => handleSettingChange('retentionDays', e.target.value)}
                        >
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                          <option value="365">1 year</option>
                          <option value="-1">Forever</option>
                        </Select>
                      </SettingsControl>
                    </SettingsRow>
                    
                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Maximum history items</div>
                        <div className="description">Keep up to this many items in history</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Select 
                          value={settings.maxHistoryItems}
                          onChange={(e) => handleSettingChange('maxHistoryItems', e.target.value)}
                        >
                          <option value="100">100 items</option>
                          <option value="500">500 items</option>
                          <option value="1000">1,000 items</option>
                          <option value="5000">5,000 items</option>
                          <option value="-1">Unlimited</option>
                        </Select>
                      </SettingsControl>
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection>
                    <h3>Clear History</h3>
                    
                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Clear non-favorited history</div>
                        <div className="description">Remove all items except favorites</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Button variant="secondary" onClick={handleClearHistory}>
                          Clear History
                        </Button>
                      </SettingsControl>
                    </SettingsRow>
                    
                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Clear everything</div>
                        <div className="description">Remove all items including favorites</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Button variant="danger" onClick={handleClearEverything}>
                          Clear Everything
                        </Button>
                      </SettingsControl>
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection>
                    <h3>App Behavior</h3>

                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Launch at login</div>
                        <div className="description">Automatically start ClipDesk when you log in</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Toggle
                          checked={settings.launchAtLogin === 'true'}
                          onChange={(e) => handleSettingChange('launchAtLogin', e.target.checked ? 'true' : 'false')}
                        />
                      </SettingsControl>
                    </SettingsRow>

                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Run in menubar</div>
                        <div className="description">Keep ClipDesk running in the background when window is closed</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Toggle
                          checked={settings.runInMenubar === 'true'}
                          onChange={(e) => handleSettingChange('runInMenubar', e.target.checked ? 'true' : 'false')}
                        />
                      </SettingsControl>
                    </SettingsRow>

                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Show in dock</div>
                        <div className="description">Keep ClipDesk visible in the dock when window is open</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Toggle
                          checked={settings.showInDock === 'true'}
                          onChange={(e) => handleSettingChange('showInDock', e.target.checked ? 'true' : 'false')}
                        />
                      </SettingsControl>
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection>
                    <h3>General</h3>

                    <SettingsRow>
                      <SettingsLabel>
                        <div className="label">Sound effects</div>
                        <div className="description">Play sounds for clipboard events</div>
                      </SettingsLabel>
                      <SettingsControl>
                        <Toggle
                          checked={settings.soundEnabled === 'true'}
                          onChange={(e) => handleSettingChange('soundEnabled', e.target.checked ? 'true' : 'false')}
                        />
                      </SettingsControl>
                    </SettingsRow>
                  </SettingsSection>
                </SettingsContainer>
              ) : filteredItems.length === 0 ? (
                <WelcomeMessage>
                  <h2>
                    {clipboardItems.length === 0 
                      ? 'Welcome to ClipDesk!' 
                      : 'No items found'
                    }
                  </h2>
                  <p>
                    {clipboardItems.length === 0 
                      ? 'Start copying text, images, or files to see them appear here. Your clipboard history is automatically saved and searchable.'
                      : 'Try adjusting your search or filter to find what you\'re looking for.'
                    }
                  </p>
                </WelcomeMessage>
              ) : (
                filteredItems.map(item => (
                  <ClipboardItem key={item.id} onClick={() => handleItemClick(item)}>
                    {renderItemPreview(item)}
                    <div className="content">
                      {getContentPreview(item)}
                    </div>
                    <div className="meta">
                      <span className="type-badge">{item.contentType}</span>
                      <span className="source-app">{item.sourceApp || 'Unknown app'}</span>
                      <SensitiveDataIndicator
                        isSensitive={item.isSensitive}
                        sensitiveTypes={item.sensitiveTypes}
                        sensitiveConfidence={item.sensitiveConfidence}
                        className="sensitive-indicator"
                      />
                      <span className="timestamp">{formatTimeAgo(item.accessedAt)}</span>
                      {item.accessCount > 1 && (
                        <span className="usage-count">Used {item.accessCount} times</span>
                      )}
                    </div>
                    <FavoriteButton
                      className={`favorite-btn ${item.isFavorite ? 'is-favorite' : ''}`}
                      onClick={(e) => handleToggleFavorite(item, e)}
                      title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {item.isFavorite ? '★' : '☆'}
                    </FavoriteButton>
                  </ClipboardItem>
                ))
              )}
            </ContentArea>
          </MainContent>
        </AppContainer>

        {/* Sensitive Data Settings Modal */}
        {showSensitiveDataSettings && (
          <SensitiveDataSettings onClose={() => setShowSensitiveDataSettings(false)} />
        )}

        {/* Update Notification */}
        <UpdateNotification />
      </ThemeContext.Provider>
    </ThemeProvider>
  )
}

export default App 