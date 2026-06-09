import { validateScrapingUrl, checkUrlAccessibility, dnaScrapeRateLimiter } from '@/lib/url-validation';

// Mock fetch for URL accessibility tests
global.fetch = jest.fn();

describe('URL Validation', () => {
  describe('validateScrapingUrl', () => {
    test('should reject invalid URLs', () => {
      const result = validateScrapingUrl('invalid-url');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });

    test('should reject non-HTTP/HTTPS protocols', () => {
      const result = validateScrapingUrl('ftp://example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Only HTTP and HTTPS URLs are allowed');
    });

    test('should reject localhost', () => {
      const result = validateScrapingUrl('http://localhost:3000');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Access to this resource is not allowed');
    });

    test('should reject private IP ranges', () => {
      const result = validateScrapingUrl('http://192.168.1.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Access to this resource is not allowed');
    });

    test('should reject blocked file extensions', () => {
      const result = validateScrapingUrl('https://example.com/file.exe');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('File type not allowed for scraping');
    });

    test('should reject path-traversal-style query parameters', () => {
      // A sensitive param whose value contains a path separator is treated as a
      // traversal attempt and rejected outright (more secure than silent stripping).
      const result = validateScrapingUrl('https://example.com?file=/etc/passwd&path=admin');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Suspicious URL parameters detected');
    });

    test('should strip dangerous query parameters from the sanitized URL', () => {
      // A benign-valued sensitive param is allowed but removed from the result.
      const result = validateScrapingUrl('https://example.com?file=report');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://example.com/');
    });

    test('should allow valid HTTPS URLs', () => {
      const result = validateScrapingUrl('https://example.com/page');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://example.com/page');
    });

    test('should handle empty/null input', () => {
      expect(validateScrapingUrl('').isValid).toBe(false);
      expect(validateScrapingUrl(null as any).isValid).toBe(false);
      expect(validateScrapingUrl(undefined as any).isValid).toBe(false);
    });
  });

  describe('checkUrlAccessibility', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return true for accessible URLs', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await checkUrlAccessibility('https://example.com');
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          method: 'HEAD',
          signal: expect.any(AbortSignal),
        })
      );
    });

    test('should return false for inaccessible URLs', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await checkUrlAccessibility('https://example.com');
      expect(result).toBe(false);
    });

    test('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await checkUrlAccessibility('https://example.com');
      expect(result).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Clear rate limiter state
      (dnaScrapeRateLimiter as any).requests.clear();
    });

    test('should allow requests within limit', () => {
      const key = 'test-key';
      
      expect(dnaScrapeRateLimiter.isAllowed(key)).toBe(true);
      expect(dnaScrapeRateLimiter.isAllowed(key)).toBe(true);
      expect(dnaScrapeRateLimiter.isAllowed(key)).toBe(true);
    });

    test('should block requests over limit', () => {
      const key = 'test-key';
      
      // Use up all allowed requests
      for (let i = 0; i < 5; i++) {
        expect(dnaScrapeRateLimiter.isAllowed(key)).toBe(true);
      }
      
      // Next request should be blocked
      expect(dnaScrapeRateLimiter.isAllowed(key)).toBe(false);
    });

    test('should handle different keys independently', () => {
      const key1 = 'user1';
      const key2 = 'user2';
      
      // Use up limit for user1
      for (let i = 0; i < 5; i++) {
        expect(dnaScrapeRateLimiter.isAllowed(key1)).toBe(true);
      }
      expect(dnaScrapeRateLimiter.isAllowed(key1)).toBe(false);
      
      // User2 should still be allowed
      expect(dnaScrapeRateLimiter.isAllowed(key2)).toBe(true);
    });
  });
});
