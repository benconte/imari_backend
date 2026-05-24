export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  data?: T;
  message?: string;
  errorCode?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  success: true;
  statusCode: number;
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  statusCode: number;
  errorCode: string;
  message: string | string[];
  path: string;
  timestamp: string;
  errors?: Array<{ path: string; message: string }>;
}
