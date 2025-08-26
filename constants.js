// js/utils/constants.js - 상수 정의
export const GRID_CELL_SIZE = 15; // meters

export const DURATION_SETTINGS = {
    irregular: { default: 60, max: 60, label: '최대 1시간' },
    regular: { default: 360, max: 360, label: '최대 6시간' }
};

export const DISPLAY_MODES = {
    HEATMAP: 'heatmap',
    SENSORY: 'sensory'
};

export const SENSORY_FILTERS = {
    ALL: 'all',
    NOISE: 'noise',
    LIGHT: 'light',
    ODOR: 'odor',
    CROWD: 'crowd'
};

export const ROUTE_TYPES = {
    SENSORY: 'sensory',
    BALANCED: 'balanced',
    TIME: 'time'
};

export const TOAST_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error'
};

export const TUTORIAL_STEPS = 4;

export const DEFAULT_MAP_CENTER = [37.5665, 126.9780]; // Seoul
export const DEFAULT_MAP_ZOOM = 14;

export const STORAGE_KEYS = {
    TUTORIAL_COMPLETED: 'tutorialCompleted',
    SENSMAP_PROFILE: 'sensmap_profile',
    COLOR_BLIND_MODE: 'colorBlindMode',
    HIGH_CONTRAST_MODE: 'highContrastMode',
    REDUCED_MOTION_MODE: 'reducedMotionMode',
    TEXT_SIZE: 'textSize'
};

export const API_ENDPOINTS = {
    HEALTH: '/api/health',
    REPORTS: '/api/reports',
    REPORT_BY_ID: (id) => `/api/reports/${id}`
};

export const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/walking';

export const WALKING_SPEED = 1.1; // m/s

export const DEMO_DATA = [
    { 
        id: 1, 
        lat: 37.5665, 
        lng: 126.9780, 
        noise: 7, 
        light: 5, 
        odor: 3, 
        crowd: 8, 
        type: 'irregular', 
        duration: 45, 
        wheelchair: false, 
        created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString() 
    },
    { 
        id: 2, 
        lat: 37.5670, 
        lng: 126.9785, 
        noise: 4, 
        light: 6, 
        odor: 5, 
        crowd: 6, 
        type: 'regular', 
        duration: 240, 
        wheelchair: false, 
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() 
    },
    { 
        id: 3, 
        lat: 37.5660, 
        lng: 126.9775, 
        noise: 8, 
        light: 4, 
        odor: 7, 
        crowd: 9, 
        type: 'irregular', 
        duration: 30, 
        wheelchair: true, 
        created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString() 
    },
    { 
        id: 4, 
        lat: 37.5675, 
        lng: 126.9790, 
        noise: 3, 
        light: 7, 
        odor: 2, 
        crowd: 4, 
        type: 'regular', 
        duration: 360, 
        wheelchair: false, 
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString() 
    },
    { 
        id: 5, 
        lat: 37.5655, 
        lng: 126.9770, 
        noise: 6, 
        light: 5, 
        odor: 4, 
        crowd: 7, 
        type: 'irregular', 
        duration: 60, 
        wheelchair: false, 
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() 
    }
];