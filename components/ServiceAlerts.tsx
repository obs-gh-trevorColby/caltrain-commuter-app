'use client';

import { useEffect, useState } from 'react';
import { ServiceAlert } from '@/lib/types';
import { getClientTracer, createHttpSpan, setResponseAttributes, recordSpanError } from '@/lib/otel-utils';

export default function ServiceAlerts() {
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);

  useEffect(() => {
    const fetchAlerts = async () => {
      const tracer = getClientTracer();
      const span = createHttpSpan(
        tracer,
        'client.fetch.alerts',
        {
          url: '/api/alerts',
          method: 'GET',
        },
        {
          'alerts.component': 'ServiceAlerts',
        }
      );

      span.setAttributes({
        'alerts.ui.loading': true,
      });

      try {
        const response = await fetch('/api/alerts');

        setResponseAttributes(span, response.status);

        if (response.ok) {
          const data = await response.json();
          const responseSize = JSON.stringify(data).length;
          const alertCount = data.alerts?.length || 0;

          // Count alerts by severity
          const alertsBySeverity = (data.alerts || []).reduce((acc: Record<string, number>, alert: ServiceAlert) => {
            acc[alert.severity] = (acc[alert.severity] || 0) + 1;
            return acc;
          }, {});

          span.setAttributes({
            'alerts.response.size': responseSize,
            'alerts.response.count': alertCount,
            'alerts.response.is_mock': data.isMockData || false,
            'alerts.severity.info': alertsBySeverity.info || 0,
            'alerts.severity.warning': alertsBySeverity.warning || 0,
            'alerts.severity.critical': alertsBySeverity.critical || 0,
          });

          setAlerts(data.alerts || []);
          setIsMockData(data.isMockData || false);

          span.setAttributes({
            'alerts.ui.success': true,
          });
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Error fetching alerts:', error);
        recordSpanError(span, error as Error, {
          'alerts.ui.error': true,
        });
      } finally {
        setLoading(false);
        span.setAttributes({
          'alerts.ui.loading': false,
        });
        span.end();
      }
    };

    fetchAlerts();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchAlerts, 300000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return null;
  }

  if (alerts.length === 0) {
    return null;
  }

  const severityStyles = {
    info: {
      container: 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600',
      icon: 'text-blue-600 dark:text-blue-400',
      title: 'text-blue-900 dark:text-blue-200',
      description: 'text-blue-700 dark:text-blue-300'
    },
    warning: {
      container: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600',
      icon: 'text-yellow-600 dark:text-yellow-400',
      title: 'text-yellow-900 dark:text-yellow-200',
      description: 'text-yellow-700 dark:text-yellow-300'
    },
    critical: {
      container: 'bg-red-50 dark:bg-red-900/30 border-red-400 dark:border-red-600',
      icon: 'text-red-600 dark:text-red-400',
      title: 'text-red-900 dark:text-red-200',
      description: 'text-red-700 dark:text-red-300'
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Service Alerts</h2>
        {isMockData && (
          <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded font-semibold">
            DEMO MODE
          </span>
        )}
      </div>

      {alerts.map((alert) => {
        const styles = severityStyles[alert.severity];

        return (
          <div
            key={alert.id}
            className={`${styles.container} border-l-4 rounded-lg p-4 shadow-sm`}
          >
            <div className="flex items-start gap-3">
              {/* Alert Icon */}
              <div className={`${styles.icon} flex-shrink-0 mt-0.5`}>
                {alert.severity === 'critical' && (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                {alert.severity === 'warning' && (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
                {alert.severity === 'info' && (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              {/* Alert Content */}
              <div className="flex-1">
                <h3 className={`${styles.title} font-semibold text-sm mb-1`}>
                  {alert.title}
                </h3>
                <p className={`${styles.description} text-sm`}>
                  {alert.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
