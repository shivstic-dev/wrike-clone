import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from './client';
import {
  downloadDepartmentReport,
  reportExportErrorMessage,
  requestDepartmentReport,
} from './reports';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
  },
}));

const getMock = vi.mocked(apiClient.get);

describe('reports API', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('normalizes screen report parameters', async () => {
    getMock.mockResolvedValueOnce({ data: { totals: { tasks: 0 } } });

    await requestDepartmentReport({
      departmentId: ' dept-1 ',
      dateFrom: '',
      scope: 'combined',
    });

    expect(getMock).toHaveBeenCalledWith('/reports/departments', {
      params: { departmentId: 'dept-1', scope: 'combined' },
    });
  });

  it('normalizes export parameters exactly like screen parameters', async () => {
    getMock.mockRejectedValueOnce(new Error('stop before browser download'));

    await expect(
      downloadDepartmentReport(
        {
          departmentId: ' dept-1 ',
          dateFrom: '',
          scope: 'combined',
        },
        'xlsx',
      ),
    ).rejects.toThrow('The report could not be exported. Please retry.');

    expect(getMock).toHaveBeenCalledWith('/reports/departments/export', {
      params: { departmentId: 'dept-1', scope: 'combined', format: 'xlsx' },
      responseType: 'blob',
    });
  });

  it('extracts a nested backend export error from a blob', async () => {
    const error = new axios.AxiosError('Request failed');
    error.response = {
      data: new Blob([
        JSON.stringify({ success: false, error: { message: 'No report data matches.' } }),
      ]),
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    };

    await expect(reportExportErrorMessage(error)).resolves.toBe('No report data matches.');
  });

  it('extracts a direct backend export error message', async () => {
    const error = new axios.AxiosError('Request failed');
    error.response = {
      data: { message: 'Export is not allowed.' },
      status: 403,
      statusText: 'Forbidden',
      headers: {},
      config: {} as never,
    };

    await expect(reportExportErrorMessage(error)).resolves.toBe('Export is not allowed.');
  });

  it.each([
    new Error('network details'),
    new axios.AxiosError('Request failed', undefined, undefined, undefined, {
      data: new Blob(['not-json']),
      status: 500,
      statusText: 'Error',
      headers: {},
      config: {} as never,
    }),
  ])('uses a safe export fallback for unusable errors', async (error) => {
    await expect(reportExportErrorMessage(error)).resolves.toBe(
      'The report could not be exported. Please retry.',
    );
  });
});
