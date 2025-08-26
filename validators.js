// js/utils/validators.js - 데이터 검증
import { DURATION_SETTINGS } from './constants.js';

export const validators = {
    // 감각 데이터 검증
    validateSensoryData(data) {
        const errors = [];

        // 위치 검증
        if (!this.validateLocation(data.lat, data.lng)) {
            errors.push('유효한 위치 정보가 필요합니다');
        }

        // 감각 데이터 검증
        if (!this.validateSensoryValues(data)) {
            errors.push('최소 하나의 감각 정보는 입력해야 합니다');
        }

        // 타입 검증
        if (!this.validateDataType(data.type)) {
            errors.push('유효한 정보 유형을 선택해주세요');
        }

        // 지속 시간 검증
        const durationError = this.validateDuration(data.duration, data.type);
        if (durationError) {
            errors.push(durationError);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    // 위치 검증
    validateLocation(lat, lng) {
        return (
            typeof lat === 'number' && 
            typeof lng === 'number' &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180
        );
    },

    // 감각 값들 검증
    validateSensoryValues(data) {
        const sensoryFields = ['noise', 'light', 'odor', 'crowd'];
        const hasAtLeastOneValue = sensoryFields.some(field => 
            data[field] !== null && 
            data[field] !== undefined && 
            data[field] !== '' &&
            this.validateSensoryValue(data[field])
        );

        return hasAtLeastOneValue;
    },

    // 개별 감각 값 검증
    validateSensoryValue(value) {
        if (value === null || value === undefined) return true;
        const numValue = Number(value);
        return !isNaN(numValue) && numValue >= 0 && numValue <= 10;
    },

    // 데이터 타입 검증
    validateDataType(type) {
        return ['irregular', 'regular'].includes(type);
    },

    // 지속 시간 검증
    validateDuration(duration, type) {
        if (duration === null || duration === undefined || duration === '') {
            return null; // 선택사항이므로 에러 없음
        }

        const numDuration = Number(duration);
        if (isNaN(numDuration)) {
            return '지속 시간은 숫자여야 합니다';
        }

        if (numDuration < 1) {
            return '지속 시간은 최소 1분이어야 합니다';
        }

        const maxDuration = DURATION_SETTINGS[type]?.max || 60;
        if (numDuration > maxDuration) {
            return `지속 시간은 최대 ${maxDuration}분까지 가능합니다`;
        }

        return null;
    },

    // 프로필 데이터 검증
    validateProfile(profile) {
        const errors = [];
        const thresholdFields = ['noiseThreshold', 'lightThreshold', 'odorThreshold', 'crowdThreshold'];

        thresholdFields.forEach(field => {
            if (!this.validateThreshold(profile[field])) {
                errors.push(`${field}는 0-10 사이의 값이어야 합니다`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    // 민감도 임계값 검증
    validateThreshold(value) {
        const numValue = Number(value);
        return !isNaN(numValue) && numValue >= 0 && numValue <= 10;
    },

    // 이메일 검증
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // URL 검증
    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    // 좌표 범위 검증 (특정 지역)
    validateSeoulBounds(lat, lng) {
        // 서울 대략적 경계
        const bounds = {
            north: 37.7,
            south: 37.4,
            east: 127.2,
            west: 126.7
        };

        return (
            lat >= bounds.south && lat <= bounds.north &&
            lng >= bounds.west && lng <= bounds.east
        );
    },

    // 텍스트 길이 검증
    validateTextLength(text, maxLength = 500) {
        if (typeof text !== 'string') return false;
        return text.length <= maxLength;
    },

    // 숫자 범위 검증
    validateNumberRange(value, min, max) {
        const numValue = Number(value);
        return !isNaN(numValue) && numValue >= min && numValue <= max;
    },

    // 배열 검증
    validateArray(arr, minLength = 0, maxLength = Infinity) {
        return (
            Array.isArray(arr) &&
            arr.length >= minLength &&
            arr.length <= maxLength
        );
    },

    // 객체 필수 필드 검증
    validateRequiredFields(obj, requiredFields) {
        const missingFields = requiredFields.filter(field => 
            !(field in obj) || obj[field] === null || obj[field] === undefined
        );

        return {
            isValid: missingFields.length === 0,
            missingFields
        };
    }
};  