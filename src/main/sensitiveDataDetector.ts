import { SensitiveDataDetection, SensitiveDataType } from './clipboardMonitor';

export class SensitiveDataDetector {
  private sensitiveDataEnabled = true;
  private detectionLevel: 'strict' | 'moderate' | 'permissive' = 'moderate';

  constructor() {
    this.loadSettings();
  }

  /**
   * Main detection method - analyzes text for sensitive information
   */
  public detectSensitiveData(text: string): SensitiveDataDetection {
    if (!this.sensitiveDataEnabled || !text || text.trim().length === 0) {
      return {
        isSensitive: false,
        detectedTypes: [],
        confidence: 'low'
      };
    }

    const detectedTypes: SensitiveDataType[] = [];
    let maxConfidence: 'low' | 'medium' | 'high' = 'low';

    // Run all detection methods
    const detections = [
      this.detectAPIKeys(text),
      this.detectPrivateKeys(text),
      this.detectJWTTokens(text),
      this.detectDatabaseURLs(text),
      this.detectCreditCards(text),
      this.detectSSN(text),
      this.detectPasswords(text),
      this.detectBearerTokens(text),
      this.detectOAuthTokens(text),
      this.detectCertificates(text),
      this.detectSSHKeys(text),
      this.detectAWSKeys(text),
      this.detectGitHubTokens(text),
      this.detectStripeKeys(text),
      this.detectGoogleAPIKeys(text)
    ];

    // Collect all detected types and determine max confidence
    for (const detection of detections) {
      if (detection.detected) {
        detectedTypes.push(...detection.types);
        if (detection.confidence === 'high') maxConfidence = 'high';
        else if (detection.confidence === 'medium' && maxConfidence !== 'high') maxConfidence = 'medium';
      }
    }

    const isSensitive = detectedTypes.length > 0;
    
    return {
      isSensitive,
      detectedTypes: [...new Set(detectedTypes)], // Remove duplicates
      confidence: maxConfidence,
      redactedContent: isSensitive ? this.redactSensitiveContent(text, detectedTypes) : undefined
    };
  }

  /**
   * Detect various API keys
   */
  private detectAPIKeys(text: string): DetectionResult {
    const patterns = [
      // Generic API key patterns
      /['\"]?[a-zA-Z0-9_-]*api[_-]?key['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9_-]{20,})['\"]?/gi,
      /['\"]?[a-zA-Z0-9_-]*secret[_-]?key['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9_-]{20,})['\"]?/gi,
      /['\"]?access[_-]?token['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9_-]{20,})['\"]?/gi,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['api_key'], confidence: 'medium' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect private keys and certificates
   */
  private detectPrivateKeys(text: string): DetectionResult {
    const patterns = [
      /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
      /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/i,
      /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/i,
      /-----BEGIN\s+DSA\s+PRIVATE\s+KEY-----/i,
      /-----BEGIN\s+ENCRYPTED\s+PRIVATE\s+KEY-----/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['private_key'], confidence: 'high' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect JWT tokens
   */
  private detectJWTTokens(text: string): DetectionResult {
    // JWT tokens start with eyJ (base64 encoded {"alg":...)
    const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
    
    if (jwtPattern.test(text)) {
      return { detected: true, types: ['jwt_token'], confidence: 'high' };
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect database connection URLs
   */
  private detectDatabaseURLs(text: string): DetectionResult {
    const patterns = [
      /mongodb(\+srv)?:\/\/[^\s]+/gi,
      /postgres(ql)?:\/\/[^\s]+/gi,
      /mysql:\/\/[^\s]+/gi,
      /redis:\/\/[^\s]+/gi,
      /sqlite:\/\/[^\s]+/gi
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['database_url'], confidence: 'high' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect credit card numbers using Luhn algorithm
   */
  private detectCreditCards(text: string): DetectionResult {
    // Remove spaces and dashes for validation
    const cleanText = text.replace(/[\s-]/g, '');
    const cardPattern = /\b\d{13,19}\b/g;
    const matches = cleanText.match(cardPattern);

    if (matches) {
      for (const match of matches) {
        if (this.isValidCreditCard(match)) {
          return { detected: true, types: ['credit_card'], confidence: 'high' };
        }
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect Social Security Numbers
   */
  private detectSSN(text: string): DetectionResult {
    const ssnPattern = /\b\d{3}-?\d{2}-?\d{4}\b/g;
    
    if (ssnPattern.test(text)) {
      return { detected: true, types: ['ssn'], confidence: 'medium' };
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect passwords in context
   */
  private detectPasswords(text: string): DetectionResult {
    const patterns = [
      /password\s*[:=]\s*['\"]?([^\s'\"]{8,})['\"]?/gi,
      /pwd\s*[:=]\s*['\"]?([^\s'\"]{8,})['\"]?/gi,
      /pass\s*[:=]\s*['\"]?([^\s'\"]{8,})['\"]?/gi,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\s*[:]\s*([^\s]{8,})/gi // email:password
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['password'], confidence: 'medium' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect Bearer tokens
   */
  private detectBearerTokens(text: string): DetectionResult {
    const bearerPattern = /Bearer\s+([A-Za-z0-9_-]{20,})/gi;
    
    if (bearerPattern.test(text)) {
      return { detected: true, types: ['bearer_token'], confidence: 'high' };
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect OAuth tokens
   */
  private detectOAuthTokens(text: string): DetectionResult {
    const patterns = [
      /oauth[_-]?token['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9_-]{20,})['\"]?/gi,
      /access[_-]?token['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9_-]{20,})['\"]?/gi,
      /refresh[_-]?token['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9_-]{20,})['\"]?/gi
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['oauth_token'], confidence: 'medium' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect certificates
   */
  private detectCertificates(text: string): DetectionResult {
    const patterns = [
      /-----BEGIN\s+CERTIFICATE-----/i,
      /-----BEGIN\s+PUBLIC\s+KEY-----/i,
      /-----BEGIN\s+X509\s+CERTIFICATE-----/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['certificate'], confidence: 'high' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect SSH keys
   */
  private detectSSHKeys(text: string): DetectionResult {
    const patterns = [
      /ssh-rsa\s+[A-Za-z0-9+/]+=*/gi,
      /ssh-ed25519\s+[A-Za-z0-9+/]+=*/gi,
      /ssh-dss\s+[A-Za-z0-9+/]+=*/gi,
      /ecdsa-sha2-nistp\d+\s+[A-Za-z0-9+/]+=*/gi
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['ssh_key'], confidence: 'high' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect AWS keys
   */
  private detectAWSKeys(text: string): DetectionResult {
    const patterns = [
      /AKIA[0-9A-Z]{16}/g, // AWS Access Key ID
      /ASIA[0-9A-Z]{16}/g, // AWS Session Token
      /[A-Za-z0-9/+=]{40}/ // AWS Secret Access Key (40 chars)
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['aws_key'], confidence: 'high' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect GitHub tokens
   */
  private detectGitHubTokens(text: string): DetectionResult {
    const patterns = [
      /ghp_[A-Za-z0-9]{36}/g, // GitHub Personal Access Token
      /gho_[A-Za-z0-9]{36}/g, // GitHub OAuth Token
      /ghu_[A-Za-z0-9]{36}/g, // GitHub User Token
      /ghs_[A-Za-z0-9]{36}/g, // GitHub Server Token
      /ghr_[A-Za-z0-9]{36}/g  // GitHub Refresh Token
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['github_token'], confidence: 'high' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect Stripe keys
   */
  private detectStripeKeys(text: string): DetectionResult {
    const patterns = [
      /sk_(live|test)_[A-Za-z0-9]{20,}/g, // Stripe Secret Key (20+ chars)
      /pk_(live|test)_[A-Za-z0-9]{20,}/g, // Stripe Publishable Key (20+ chars)
      /rk_(live|test)_[A-Za-z0-9]{20,}/g  // Stripe Restricted Key (20+ chars)
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { detected: true, types: ['stripe_key'], confidence: 'high' };
      }
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Detect Google API keys
   */
  private detectGoogleAPIKeys(text: string): DetectionResult {
    const pattern = /AIza[0-9A-Za-z_-]{35}/g;
    
    if (pattern.test(text)) {
      return { detected: true, types: ['google_api_key'], confidence: 'high' };
    }

    return { detected: false, types: [], confidence: 'low' };
  }

  /**
   * Validate credit card using Luhn algorithm
   */
  private isValidCreditCard(cardNumber: string): boolean {
    if (!/^\d+$/.test(cardNumber)) return false;
    
    let sum = 0;
    let isEven = false;
    
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }

  /**
   * Redact sensitive content for display
   */
  private redactSensitiveContent(text: string, types: SensitiveDataType[]): string {
    let redacted = text;

    // Redact based on detected types
    if (types.includes('private_key') || types.includes('certificate')) {
      redacted = redacted.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/gi, '[REDACTED: PRIVATE KEY/CERTIFICATE]');
    }

    if (types.includes('jwt_token')) {
      redacted = redacted.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[REDACTED: JWT TOKEN]');
    }

    if (types.includes('credit_card')) {
      redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[REDACTED: CREDIT CARD]');
    }

    if (types.includes('ssn')) {
      redacted = redacted.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[REDACTED: SSN]');
    }

    // Generic redaction for other sensitive patterns
    redacted = redacted.replace(/[A-Za-z0-9+/]{40,}/g, (match) => {
      if (match.length > 20) return '[REDACTED: LONG TOKEN]';
      return match;
    });

    return redacted;
  }

  /**
   * Load settings from database
   */
  private async loadSettings(): Promise<void> {
    try {
      // These would be loaded from your settings system
      // For now, using defaults
      this.sensitiveDataEnabled = true;
      this.detectionLevel = 'moderate';
    } catch (error) {
      console.error('Error loading sensitive data settings:', error);
    }
  }

  /**
   * Update detection settings
   */
  public updateSettings(enabled: boolean, level: 'strict' | 'moderate' | 'permissive'): void {
    this.sensitiveDataEnabled = enabled;
    this.detectionLevel = level;
  }

  /**
   * Get human-readable description of detected sensitive data types
   */
  public getTypeDescription(type: SensitiveDataType): string {
    const descriptions: Record<SensitiveDataType, string> = {
      'api_key': 'API Key',
      'private_key': 'Private Key',
      'jwt_token': 'JWT Token',
      'database_url': 'Database Connection URL',
      'credit_card': 'Credit Card Number',
      'ssn': 'Social Security Number',
      'password': 'Password',
      'bearer_token': 'Bearer Token',
      'oauth_token': 'OAuth Token',
      'certificate': 'Certificate',
      'ssh_key': 'SSH Key',
      'aws_key': 'AWS Access Key',
      'github_token': 'GitHub Token',
      'stripe_key': 'Stripe API Key',
      'google_api_key': 'Google API Key'
    };

    return descriptions[type] || 'Unknown Sensitive Data';
  }
}

interface DetectionResult {
  detected: boolean;
  types: SensitiveDataType[];
  confidence: 'low' | 'medium' | 'high';
}
