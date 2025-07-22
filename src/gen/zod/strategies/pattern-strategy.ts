/**
 * Pattern-based generation strategy for common Zod string patterns.
 *
 * This strategy handles the patterns we've already implemented:
 * email, UUID, URLs, etc. It provides high-quality, realistic data
 * for the most common use cases.
 */

import { z } from 'zod';
import {
  ZodGenerationStrategy,
  ZodGenerationContext,
} from '../core/strategy.js';
import { GeneratorFn } from '@/gen/core.js';
import {
  email,
  url,
  uuid,
  datetime,
  ipv4,
  ipv6,
  regex,
  includes,
  startsWith,
  endsWith,
  emoji,
  nanoid,
  cuid,
  cuid2,
  ulid,
  base64,
  base64url,
  jwt,
  cidr,
  time,
  dateString,
  duration,
} from '../patterns/string-patterns.js';

/**
 * Strategy that handles string patterns using our specialized generators.
 * High priority because these produce the best quality data.
 */
export class PatternStrategy implements ZodGenerationStrategy {
  readonly name = 'PatternStrategy';
  readonly priority = 100; // Highest priority

  canHandle(context: ZodGenerationContext): boolean {
    const { schema } = context;
    const def = (schema as any)._def;

    // Only handle ZodString with specific patterns
    if (def?.typeName !== z.ZodFirstPartyTypeKind.ZodString) {
      return false;
    }

    // Check if any checks match our supported patterns
    if (!def.checks || !Array.isArray(def.checks)) {
      return false;
    }

    const supportedPatterns = this.getSupportedPatterns();
    const matchingChecks = def.checks.filter((check: any) =>
      supportedPatterns.includes(check.kind)
    );

    // Don't handle combined constraints - let ConstraintStrategy handle those
    if (matchingChecks.length > 1) {
      return false;
    }

    // Only handle single patterns that we support well
    return matchingChecks.length === 1;
  }

  build(context: ZodGenerationContext): GeneratorFn<string> {
    const { schema } = context;
    const def = (schema as any)._def;

    // Extract pattern information from checks
    const patterns = this.extractPatterns(def.checks || []);

    // Handle each pattern type (order matters - most specific first)
    if (patterns.isEmail) return email();
    if (patterns.isUrl) return url();
    if (patterns.isUuid) return uuid();
    if (patterns.isDatetime) return datetime();
    if (patterns.isEmoji) return emoji();
    if (patterns.isNanoid) return nanoid();
    if (patterns.isCuid) return cuid();
    if (patterns.isCuid2) return cuid2();
    if (patterns.isUlid) return ulid();
    if (patterns.isBase64) return base64();
    if (patterns.isBase64url) return base64url();
    if (patterns.isJwt) return jwt();
    if (patterns.isCidr) return cidr(patterns.cidrVersion);
    if (patterns.isDate) return dateString();
    if (patterns.isTime) return time(patterns.timePrecision);
    if (patterns.isDuration) return duration();
    if (patterns.isIp) return patterns.ipVersion === 'v6' ? ipv6() : ipv4();
    if (patterns.regexPattern) return regex(patterns.regexPattern);
    if (patterns.includesValue)
      return includes(patterns.includesValue, patterns.includesPosition);
    if (patterns.startsWithValue) return startsWith(patterns.startsWithValue);
    if (patterns.endsWithValue) return endsWith(patterns.endsWithValue);

    // Shouldn't reach here if canHandle is correct
    throw new Error(`PatternStrategy: No handler for detected pattern`);
  }

  private getSupportedPatterns(): string[] {
    return [
      'email',
      'url',
      'uuid',
      'datetime',
      'emoji',
      'nanoid',
      'cuid',
      'cuid2',
      'ulid',
      'base64',
      'base64url',
      'jwt',
      'cidr',
      'date',
      'time',
      'duration',
      'ip',
      'regex',
      'includes',
      'startsWith',
      'endsWith',
    ];
  }

  private extractPatterns(checks: any[]) {
    const patterns = {
      isEmail: false,
      isUrl: false,
      isUuid: false,
      isDatetime: false,
      isEmoji: false,
      isNanoid: false,
      isCuid: false,
      isCuid2: false,
      isUlid: false,
      isBase64: false,
      isBase64url: false,
      isJwt: false,
      isCidr: false,
      cidrVersion: undefined as 'v4' | 'v6' | undefined,
      isDate: false,
      isTime: false,
      timePrecision: undefined as number | undefined,
      isDuration: false,
      isIp: false,
      ipVersion: undefined as 'v4' | 'v6' | undefined,
      regexPattern: undefined as RegExp | undefined,
      includesValue: undefined as string | undefined,
      includesPosition: undefined as number | undefined,
      startsWithValue: undefined as string | undefined,
      endsWithValue: undefined as string | undefined,
    };

    for (const check of checks) {
      switch (check.kind) {
        case 'email':
          patterns.isEmail = true;
          break;
        case 'url':
          patterns.isUrl = true;
          break;
        case 'uuid':
          patterns.isUuid = true;
          break;
        case 'datetime':
          patterns.isDatetime = true;
          break;
        case 'emoji':
          patterns.isEmoji = true;
          break;
        case 'nanoid':
          patterns.isNanoid = true;
          break;
        case 'cuid':
          patterns.isCuid = true;
          break;
        case 'cuid2':
          patterns.isCuid2 = true;
          break;
        case 'ulid':
          patterns.isUlid = true;
          break;
        case 'base64':
          patterns.isBase64 = true;
          break;
        case 'base64url':
          patterns.isBase64url = true;
          break;
        case 'jwt':
          patterns.isJwt = true;
          break;
        case 'cidr':
          patterns.isCidr = true;
          patterns.cidrVersion = check.version;
          break;
        case 'date':
          patterns.isDate = true;
          break;
        case 'time':
          patterns.isTime = true;
          patterns.timePrecision = check.precision;
          break;
        case 'duration':
          patterns.isDuration = true;
          break;
        case 'ip':
          patterns.isIp = true;
          patterns.ipVersion = check.version;
          break;
        case 'regex':
          patterns.regexPattern = check.regex;
          break;
        case 'includes':
          patterns.includesValue = check.value;
          patterns.includesPosition = check.position;
          break;
        case 'startsWith':
          patterns.startsWithValue = check.value;
          break;
        case 'endsWith':
          patterns.endsWithValue = check.value;
          break;
      }
    }

    return patterns;
  }
}
