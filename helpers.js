// js/utils/helpers.js - 공통 헬퍼 함수들
export const helpers = {
    // 시간 관련
    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}일 전`;
        if (hours > 0) return `${hours}시간 전`;
        if (minutes > 0) return `${minutes}분 전`;
        return '방금 전';
    },

    // 시간 감쇠 계산
    calculateTimeDecay(timestamp, type, currentTime) {
        const ageMs = currentTime - timestamp;
        const ageHours = ageMs / (1000 * 60 * 60);

        let maxAge, decayRate;

        if (type === 'irregular') {
            maxAge = 6;
            decayRate = 0.8;
        } else {
            maxAge = 168;
            decayRate = 0.3;
        }

        if (ageHours >= maxAge) return 0;

        return Math.exp(-decayRate * (ageHours / maxAge));
    },

    // 개인화된 점수 계산
    calculatePersonalizedScore(sensoryData, profile) {
        const weights = {
            noise: profile.noiseThreshold / 10,
            light: profile.lightThreshold / 10,
            odor: profile.odorThreshold / 10,
            crowd: profile.crowdThreshold / 10
        };

        let totalScore = 0;
        let totalWeight = 0;

        Object.keys(weights).forEach(key => {
            if (sensoryData[key] !== undefined && sensoryData[key] !== null) {
                totalScore += sensoryData[key] * weights[key];
                totalWeight += weights[key];
            }
        });

        return totalWeight > 0 ? totalScore / totalWeight : 0;
    },

    // 그리드 관련
    getGridKey(latlng, gridCellSize = 15) {
        const x = Math.floor(latlng.lng * 111320 / gridCellSize);
        const y = Math.floor(latlng.lat * 111320 / gridCellSize);
        return `${x},${y}`;
    },

    getGridBounds(gridKey, gridCellSize = 15) {
        const [x, y] = gridKey.split(',').map(Number);
        const lng1 = x * gridCellSize / 111320;
        const lat1 = y * gridCellSize / 111320;
        const lng2 = (x + 1) * gridCellSize / 111320;
        const lat2 = (y + 1) * gridCellSize / 111320;
        return L.latLngBounds([lat1, lng1], [lat2, lng2]);
    },

    // 스로틀링
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    },

    // 디바운싱
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // 로컬 스토리지 헬퍼
    storage: {
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.warn(`Failed to get ${key} from localStorage:`, error);
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn(`Failed to set ${key} to localStorage:`, error);
                return false;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.warn(`Failed to remove ${key} from localStorage:`, error);
                return false;
            }
        }
    },

    // 역지오코딩
    async getAddressFromLatLng(latlng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'SensmapApp/1.0 (dev@sensmap.app)' }
            });
            const data = await response.json();

            if (data.display_name) {
                return data.display_name.split(',').slice(0, 3).join(',');
            } else {
                return `주소 정보 없음 (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
            }
        } catch (error) {
            console.error("역지오코딩 오류:", error);
            return `주소 로드 실패`;
        }
    },

    // 경로 타입 라벨
    getRouteTypeLabel(routeType) {
        switch (routeType) {
            case 'sensory': return '감각 친화적';
            case 'balanced': return '균형잡힌';
            case 'time': return '시간 우선';
            default: return '최적';
        }
    },

    // 색상 생성
    generateSensoryColor(sensorType, value) {
        const normalizedValue = Math.max(0, Math.min(10, value));

        switch (sensorType) {
            case 'noise':
                return `hsl(${360 - (normalizedValue * 36)}, 70%, 50%)`;
            case 'light':
                return `hsl(${60 - (normalizedValue * 6)}, 70%, ${50 + (normalizedValue * 3)}%)`;
            case 'odor':
                return `hsl(${300 - (normalizedValue * 30)}, 70%, 50%)`;
            case 'crowd':
                return `hsl(${240 - (normalizedValue * 24)}, 70%, 50%)`;
            default:
                const hue = (10 - normalizedValue) * 12;
                return `hsl(${hue}, 70%, 50%)`;
        }
    },

    // 감각 아이콘
    getSensoryIcon(sensorType, hasWheelchairIssue = false) {
        if (hasWheelchairIssue) return '♿';
        
        switch (sensorType) {
            case 'noise': return '🔊';
            case 'light': return '💡';
            case 'odor': return '👃';
            case 'crowd': return '👥';
            default: return '🌍';
        }
    },

    // 데이터 검증
    validateSensoryData(data) {
        const errors = [];

        // 위치 검증
        if (!data.lat || !data.lng) {
            errors.push('위치 정보가 필요합니다');
        }

        // 감각 데이터 검증
        const sensoryFields = ['noise', 'light', 'odor', 'crowd'];
        const hasAtLeastOneValue = sensoryFields.some(field => 
            data[field] !== null && data[field] !== undefined && data[field] !== ''
        );

        if (!hasAtLeastOneValue) {
            errors.push('최소 하나의 감각 정보는 입력해야 합니다');
        }

        // 타입 검증
        if (!data.type || !['irregular', 'regular'].includes(data.type)) {
            errors.push('유효한 정보 유형을 선택해주세요');
        }

        // 지속 시간 검증
        if (data.duration !== null && data.duration !== undefined) {
            const maxDuration = data.type === 'irregular' ? 60 : 360;
            if (isNaN(data.duration) || data.duration < 1 || data.duration > maxDuration) {
                errors.push(`지속 시간은 1분에서 ${maxDuration}분 사이여야 합니다`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    // 민감도 프로필 기본값
    getDefaultSensitivityProfile() {
        return {
            noiseThreshold: 5,
            lightThreshold: 5,
            odorThreshold: 5,
            crowdThreshold: 5
        };
    },

    // 접근성 설정 기본값
    getDefaultAccessibilitySettings() {
        return {
            colorBlindMode: false,
            highContrastMode: false,
            reducedMotionMode: false,
            textSize: 1
        };
    }
};