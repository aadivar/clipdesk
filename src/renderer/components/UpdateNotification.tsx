import React, { useState, useEffect } from 'react'
import styled from 'styled-components'

const UpdateContainer = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #007AFF;
  color: white;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 300px;
  z-index: 1000;
  font-size: 13px;
  line-height: 1.4;
`

const UpdateButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  margin-left: 8px;
  cursor: pointer;
  font-size: 12px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`

const CloseButton = styled.button`
  background: none;
  border: none;
  color: white;
  float: right;
  cursor: pointer;
  font-size: 14px;
  margin-left: 8px;
  
  &:hover {
    opacity: 0.7;
  }
`

const UpdateNotification: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string>('')

  useEffect(() => {
    // Get current version
    const getCurrentVersion = async () => {
      try {
        if (window.clipdesk?.app?.getVersion) {
          const result = await window.clipdesk.app.getVersion()
          if (result.success) {
            setCurrentVersion(result.version)
          }
        }
      } catch (error) {
        console.error('Error getting app version:', error)
      }
    }

    getCurrentVersion()

    // Listen for update status
    const handleUpdateStatus = (message: string) => {
      console.log('Update status:', message)
      setUpdateStatus(message)
      setIsVisible(true)

      // Auto-hide after 5 seconds for non-critical messages
      if (message.includes('up to date') || message.includes('error')) {
        setTimeout(() => setIsVisible(false), 5000)
      }
    }

    if (window.clipdesk?.on) {
      window.clipdesk.on('update-status', handleUpdateStatus)
    }

    return () => {
      if (window.clipdesk?.off) {
        window.clipdesk.off('update-status', handleUpdateStatus)
      }
    }
  }, [])

  const handleCheckForUpdates = async () => {
    try {
      if (window.clipdesk?.updater?.checkForUpdates) {
        await window.clipdesk.updater.checkForUpdates()
      }
    } catch (error) {
      console.error('Error checking for updates:', error)
    }
  }

  const handleClose = () => {
    setIsVisible(false)
  }

  if (!isVisible || !updateStatus) {
    return null
  }

  return (
    <UpdateContainer>
      <CloseButton onClick={handleClose}>×</CloseButton>
      <div>
        <strong>ClipDesk v{currentVersion}</strong>
        <br />
        {updateStatus}
        {updateStatus.includes('up to date') && (
          <UpdateButton onClick={handleCheckForUpdates}>
            Check Again
          </UpdateButton>
        )}
      </div>
    </UpdateContainer>
  )
}

export default UpdateNotification 