import api from './api';
import { StatisticsResponse } from '../types/statistics';

export const statisticsService = {
  /**
   * Get email statistics for the dashboard
   * @param period - Time period: '7d', '30d', or '90d'
   * @returns Statistics data including status distribution, trends, top senders, and activity
   */
  getStatistics: async (period: '7d' | '30d' | '90d' = '30d'): Promise<StatisticsResponse> => {
    const response = await api.get(`statistics?period=${period}`);
    return response.data;
  },
};

export default statisticsService;
