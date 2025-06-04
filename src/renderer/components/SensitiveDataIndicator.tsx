import React, { useState, useEffect } from 'react';

interface SensitiveDataIndicatorProps {
  isSensitive?: boolean;
  sensitiveTypes?: string[];
  sensitiveConfidence?: 'low' | 'medium' | 'high';
  className?: string;
}

export const SensitiveDataIndicator: React.FC<SensitiveDataIndicatorProps> = ({
  isSensitive,
  sensitiveTypes = [],
  sensitiveConfidence,
  className = ''
}) => {
  const [typeDescriptions, setTypeDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadDescriptions = async () => {
      if (!sensitiveTypes.length) return;
      
      const descriptions: Record<string, string> = {};
      for (const type of sensitiveTypes) {
        try {
          const description = await window.clipdesk.sensitiveData.getTypeDescription(type);
          descriptions[type] = description;
        } catch (error) {
          console.error('Failed to get description for type:', type, error);
          descriptions[type] = type.replace(/_/g, ' ').toUpperCase();
        }
      }
      setTypeDescriptions(descriptions);
    };

    loadDescriptions();
  }, [sensitiveTypes]);

  if (!isSensitive || !sensitiveTypes.length) {
    return null;
  }

  const getConfidenceColor = (confidence?: string) => {
    switch (confidence) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getConfidenceIcon = (confidence?: string) => {
    switch (confidence) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟠';
      default: return '⚠️';
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs font-medium ${getConfidenceColor(sensitiveConfidence)} ${className}`}>
      <span className="text-sm">{getConfidenceIcon(sensitiveConfidence)}</span>
      <span>Sensitive Data</span>
      {sensitiveTypes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sensitiveTypes.slice(0, 2).map((type) => (
            <span
              key={type}
              className="px-1.5 py-0.5 bg-white bg-opacity-60 rounded text-xs"
              title={typeDescriptions[type] || type}
            >
              {typeDescriptions[type] || type.replace(/_/g, ' ')}
            </span>
          ))}
          {sensitiveTypes.length > 2 && (
            <span className="px-1.5 py-0.5 bg-white bg-opacity-60 rounded text-xs">
              +{sensitiveTypes.length - 2} more
            </span>
          )}
        </div>
      )}
    </div>
  );
};

interface SensitiveDataSettingsProps {
  onClose: () => void;
}

export const SensitiveDataSettings: React.FC<SensitiveDataSettingsProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<{
    enabled: boolean;
    level: 'strict' | 'moderate' | 'permissive';
  }>({ enabled: true, level: 'moderate' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await window.clipdesk.sensitiveData.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load sensitive data settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: typeof settings) => {
    try {
      await window.clipdesk.sensitiveData.updateSettings(newSettings.enabled, newSettings.level);
      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to update sensitive data settings:', error);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Sensitive Data Detection</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => updateSettings({ ...settings, enabled: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span>Enable sensitive data detection</span>
            </label>
            <p className="text-sm text-gray-500 mt-1">
              Automatically detect and flag sensitive information like API keys, passwords, and private keys.
            </p>
          </div>

          {settings.enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Detection Level
              </label>
              <div className="space-y-2">
                {[
                  { value: 'strict', label: 'Strict', desc: 'Detect all potential sensitive data with high sensitivity' },
                  { value: 'moderate', label: 'Moderate', desc: 'Balanced detection with fewer false positives' },
                  { value: 'permissive', label: 'Permissive', desc: 'Only detect obvious sensitive data patterns' }
                ].map((option) => (
                  <label key={option.value} className="flex items-start space-x-2">
                    <input
                      type="radio"
                      name="level"
                      value={option.value}
                      checked={settings.level === option.value}
                      onChange={(e) => updateSettings({ ...settings, level: e.target.value as any })}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-gray-500">{option.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h3 className="font-medium text-blue-900 mb-2">What we detect:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• API Keys (AWS, GitHub, Google, Stripe, etc.)</li>
              <li>• Private Keys & Certificates</li>
              <li>• JWT Tokens & Bearer Tokens</li>
              <li>• Database Connection URLs</li>
              <li>• Credit Card Numbers</li>
              <li>• Social Security Numbers</li>
              <li>• Passwords in context</li>
            </ul>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <h3 className="font-medium text-green-900 mb-2">🔒 Privacy First</h3>
            <p className="text-sm text-green-800">
              All detection happens locally on your device. No data is sent to external servers.
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
