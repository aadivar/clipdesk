/**
 * Environment utilities for Electron main process
 */

export const isDev = (): boolean => {
  return process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath)
}

export const isProd = (): boolean => !isDev()

export const platform = process.platform

export const isWindows = platform === 'win32'
export const isMacOS = platform === 'darwin'
export const isLinux = platform === 'linux'

// Import app after conditional to avoid circular dependency issues
import { app } from 'electron' 