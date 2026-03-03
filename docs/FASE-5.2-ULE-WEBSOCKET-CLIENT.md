# Fase 5.2: Cliente WebSocket para ULE

## Resumen

Este documento especifica cómo implementar el cliente WebSocket en ULE (Next.js) para conectarse al servidor RPA y recibir actualizaciones en tiempo real.

---

## Configuración

### Dependencias

```bash
npm install socket.io-client
```

### Variables de Entorno

```env
# .env.local
NEXT_PUBLIC_RPA_WS_URL=http://localhost:3001
RPA_API_KEY=your_api_key_here
```

---

## Implementación del Cliente

### 1. Hook useRPASocket

```typescript
// lib/hooks/useRPASocket.ts
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface RPASocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
}

interface RPASocketState {
  isConnected: boolean;
  socketId: string | null;
  error: Error | null;
}

export function useRPASocket(options: RPASocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<RPASocketState>({
    isConnected: false,
    socketId: null,
    error: null,
  });

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(process.env.NEXT_PUBLIC_RPA_WS_URL!, {
      path: '/socket.io/',
      auth: {
        apiKey: process.env.RPA_API_KEY,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      setState({
        isConnected: true,
        socketId: socket.id ?? null,
        error: null,
      });
      options.onConnect?.();
    });

    socket.on('disconnect', (reason) => {
      setState((prev) => ({
        ...prev,
        isConnected: false,
      }));
      options.onDisconnect?.(reason);
    });

    socket.on('connect_error', (error) => {
      setState((prev) => ({
        ...prev,
        error,
        isConnected: false,
      }));
      options.onError?.(error);
    });

    socketRef.current = socket;
  }, [options]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  // Subscribe to a specific task
  const subscribeToTask = useCallback((taskId: string) => {
    socketRef.current?.emit('subscribe:task', taskId);
  }, []);

  // Unsubscribe from a task
  const unsubscribeFromTask = useCallback((taskId: string) => {
    socketRef.current?.emit('unsubscribe:task', taskId);
  }, []);

  // Request current stats
  const requestStats = useCallback(() => {
    socketRef.current?.emit('request:stats');
  }, []);

  // Request active tasks
  const requestActiveTasks = useCallback(() => {
    socketRef.current?.emit('request:activeTasks');
  }, []);

  // Generic event listener
  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
    return () => {
      socketRef.current?.off(event, callback);
    };
  }, []);

  // Generic event emitter
  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  useEffect(() => {
    if (options.autoConnect !== false) {
      connect();
    }
    return () => disconnect();
  }, [connect, disconnect, options.autoConnect]);

  return {
    ...state,
    socket: socketRef.current,
    connect,
    disconnect,
    subscribeToTask,
    unsubscribeFromTask,
    requestStats,
    requestActiveTasks,
    on,
    emit,
  };
}
```

---

### 2. Hook useDashboardRealtime

```typescript
// lib/hooks/useDashboardRealtime.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRPASocket } from './useRPASocket';

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed?: number;
}

interface TaskEvent {
  taskId: string;
  type?: string;
  status?: string;
  userId?: string;
  progress?: number;
  message?: string;
  error?: string;
  result?: Record<string, unknown>;
  duration?: number;
  timestamp: string;
}

interface PlanillaEvent {
  planillaId: string;
  numeroPlanilla: string;
  estadoPago: string;
  hasComprobante?: boolean;
  userId?: string;
  timestamp: string;
}

interface ComprobanteEvent {
  planillaId: string;
  numeroPlanilla: string;
  fileUrl: string;
  userId: string;
  timestamp: string;
}

interface DashboardState {
  queue: QueueStats | null;
  recentTasks: TaskEvent[];
  activeTasks: any[];
  lastUpdate: Date | null;
}

export function useDashboardRealtime() {
  const { isConnected, on, requestStats, requestActiveTasks } = useRPASocket({
    autoConnect: true,
  });

  const [state, setState] = useState<DashboardState>({
    queue: null,
    recentTasks: [],
    activeTasks: [],
    lastUpdate: null,
  });

  // Task event handlers
  const handleTaskCreated = useCallback((event: TaskEvent) => {
    setState((prev) => ({
      ...prev,
      recentTasks: [event, ...prev.recentTasks.slice(0, 19)],
      lastUpdate: new Date(),
    }));
  }, []);

  const handleTaskUpdated = useCallback((event: TaskEvent) => {
    setState((prev) => ({
      ...prev,
      recentTasks: prev.recentTasks.map((t) =>
        t.taskId === event.taskId ? { ...t, ...event } : t
      ),
      activeTasks: prev.activeTasks.map((t) =>
        t.id === event.taskId ? { ...t, status: event.status } : t
      ),
      lastUpdate: new Date(),
    }));
  }, []);

  const handleTaskCompleted = useCallback((event: TaskEvent) => {
    setState((prev) => ({
      ...prev,
      activeTasks: prev.activeTasks.filter((t) => t.id !== event.taskId),
      lastUpdate: new Date(),
    }));
  }, []);

  const handleTaskFailed = useCallback((event: TaskEvent) => {
    setState((prev) => ({
      ...prev,
      activeTasks: prev.activeTasks.filter((t) => t.id !== event.taskId),
      lastUpdate: new Date(),
    }));
  }, []);

  const handleQueueUpdate = useCallback((stats: QueueStats) => {
    setState((prev) => ({
      ...prev,
      queue: stats,
      lastUpdate: new Date(),
    }));
  }, []);

  const handleMetricsBroadcast = useCallback(
    (data: { queue: QueueStats; connectedClients: number; timestamp: string }) => {
      setState((prev) => ({
        ...prev,
        queue: data.queue,
        lastUpdate: new Date(data.timestamp),
      }));
    },
    []
  );

  const handleActiveTasks = useCallback(
    (data: { tasks: any[]; timestamp: string }) => {
      setState((prev) => ({
        ...prev,
        activeTasks: data.tasks,
        lastUpdate: new Date(data.timestamp),
      }));
    },
    []
  );

  const handleStatsCurrent = useCallback(
    (data: { queue: QueueStats; timestamp: string }) => {
      setState((prev) => ({
        ...prev,
        queue: data.queue,
        lastUpdate: new Date(data.timestamp),
      }));
    },
    []
  );

  // Subscribe to events
  useEffect(() => {
    const unsubscribers = [
      on('task:created', handleTaskCreated),
      on('task:updated', handleTaskUpdated),
      on('task:completed', handleTaskCompleted),
      on('task:failed', handleTaskFailed),
      on('queue:updated', handleQueueUpdate),
      on('metrics:broadcast', handleMetricsBroadcast),
      on('activeTasks:current', handleActiveTasks),
      on('stats:current', handleStatsCurrent),
    ];

    // Request initial data
    if (isConnected) {
      requestStats();
      requestActiveTasks();
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    isConnected,
    on,
    requestStats,
    requestActiveTasks,
    handleTaskCreated,
    handleTaskUpdated,
    handleTaskCompleted,
    handleTaskFailed,
    handleQueueUpdate,
    handleMetricsBroadcast,
    handleActiveTasks,
    handleStatsCurrent,
  ]);

  return {
    isConnected,
    ...state,
    refresh: () => {
      requestStats();
      requestActiveTasks();
    },
  };
}
```

---

### 3. Hook useTaskRealtime (para página de detalle)

```typescript
// lib/hooks/useTaskRealtime.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRPASocket } from './useRPASocket';

interface TaskLog {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

interface TaskDetailState {
  status: string | null;
  progress: number | null;
  logs: TaskLog[];
  lastUpdate: Date | null;
}

export function useTaskRealtime(taskId: string) {
  const { isConnected, on, subscribeToTask, unsubscribeFromTask } = useRPASocket({
    autoConnect: true,
  });

  const [state, setState] = useState<TaskDetailState>({
    status: null,
    progress: null,
    logs: [],
    lastUpdate: null,
  });

  const handleTaskDetail = useCallback(
    (event: { taskId: string; status?: string; progress?: number; message?: string }) => {
      if (event.taskId !== taskId) return;
      setState((prev) => ({
        ...prev,
        status: event.status ?? prev.status,
        progress: event.progress ?? prev.progress,
        lastUpdate: new Date(),
      }));
    },
    [taskId]
  );

  const handleLog = useCallback(
    (log: TaskLog & { taskId: string }) => {
      if (log.taskId !== taskId) return;
      setState((prev) => ({
        ...prev,
        logs: [...prev.logs, log],
        lastUpdate: new Date(),
      }));
    },
    [taskId]
  );

  useEffect(() => {
    if (isConnected && taskId) {
      subscribeToTask(taskId);
    }

    const unsubscribers = [
      on('task:detail', handleTaskDetail),
      on('log:new', handleLog),
    ];

    return () => {
      if (taskId) {
        unsubscribeFromTask(taskId);
      }
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    isConnected,
    taskId,
    subscribeToTask,
    unsubscribeFromTask,
    on,
    handleTaskDetail,
    handleLog,
  ]);

  return {
    isConnected,
    ...state,
  };
}
```

---

### 4. Hook usePlanillaNotifications

```typescript
// lib/hooks/usePlanillaNotifications.ts
'use client';

import { useEffect, useCallback } from 'react';
import { useRPASocket } from './useRPASocket';
import { toast } from 'sonner'; // or your toast library

interface PlanillaEvent {
  planillaId: string;
  numeroPlanilla: string;
  estadoPago: string;
  hasComprobante?: boolean;
  userId?: string;
  timestamp: string;
}

interface ComprobanteEvent {
  planillaId: string;
  numeroPlanilla: string;
  fileUrl: string;
  userId: string;
  timestamp: string;
}

export function usePlanillaNotifications(userId?: string) {
  const { isConnected, on } = useRPASocket({ autoConnect: true });

  const handlePlanillaUpdate = useCallback(
    (event: PlanillaEvent) => {
      // Filter by user if specified
      if (userId && event.userId !== userId) return;

      if (event.estadoPago === 'PAGADA') {
        toast.success(`Planilla ${event.numeroPlanilla} pagada`);
      } else if (event.estadoPago === 'RECHAZADA') {
        toast.error(`Planilla ${event.numeroPlanilla} rechazada`);
      } else if (event.estadoPago === 'VENCIDA') {
        toast.warning(`Planilla ${event.numeroPlanilla} vencida`);
      }
    },
    [userId]
  );

  const handleComprobanteReady = useCallback(
    (event: ComprobanteEvent) => {
      // Filter by user if specified
      if (userId && event.userId !== userId) return;

      toast.success(`Comprobante disponible para planilla ${event.numeroPlanilla}`, {
        action: {
          label: 'Descargar',
          onClick: () => window.open(event.fileUrl, '_blank'),
        },
      });
    },
    [userId]
  );

  useEffect(() => {
    const unsubscribers = [
      on('planilla:updated', handlePlanillaUpdate),
      on('comprobante:ready', handleComprobanteReady),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [on, handlePlanillaUpdate, handleComprobanteReady]);

  return { isConnected };
}
```

---

## Componentes de Ejemplo

### Dashboard con WebSocket

```tsx
// app/(admin)/dashboard/page.tsx
'use client';

import { useDashboardRealtime } from '@/lib/hooks/useDashboardRealtime';

export default function DashboardPage() {
  const { isConnected, queue, recentTasks, activeTasks, lastUpdate, refresh } =
    useDashboardRealtime();

  return (
    <div>
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span>{isConnected ? 'Conectado' : 'Desconectado'}</span>
        {lastUpdate && (
          <span className="text-sm text-gray-500">
            Actualizado: {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Queue Stats */}
      {queue && (
        <div className="grid grid-cols-4 gap-4 mt-4">
          <StatCard title="En espera" value={queue.waiting} />
          <StatCard title="Activos" value={queue.active} />
          <StatCard title="Completados" value={queue.completed} />
          <StatCard title="Fallidos" value={queue.failed} />
        </div>
      )}

      {/* Active Tasks */}
      <div className="mt-4">
        <h2>Tareas Activas ({activeTasks.length})</h2>
        {activeTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>

      {/* Recent Activity */}
      <div className="mt-4">
        <h2>Actividad Reciente</h2>
        {recentTasks.map((event, i) => (
          <ActivityItem key={`${event.taskId}-${i}`} event={event} />
        ))}
      </div>

      <button onClick={refresh}>Refrescar</button>
    </div>
  );
}
```

### Detalle de Tarea con Logs en Tiempo Real

```tsx
// app/(admin)/tasks/[id]/page.tsx
'use client';

import { useTaskRealtime } from '@/lib/hooks/useTaskRealtime';

export default function TaskDetailPage({ params }: { params: { id: string } }) {
  const { isConnected, status, progress, logs } = useTaskRealtime(params.id);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span>Estado: {status}</span>
        {progress !== null && <span>Progreso: {progress}%</span>}
      </div>

      {/* Real-time Logs */}
      <div className="mt-4 space-y-2">
        <h2>Logs</h2>
        {logs.map((log, i) => (
          <div
            key={i}
            className={`p-2 rounded ${
              log.level === 'ERROR'
                ? 'bg-red-100'
                : log.level === 'WARN'
                ? 'bg-yellow-100'
                : 'bg-gray-100'
            }`}
          >
            <span className="text-xs text-gray-500">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className="ml-2 font-mono">[{log.level}]</span>
            <span className="ml-2">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Provider para Toda la App

```tsx
// providers/RPASocketProvider.tsx
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useRPASocket } from '@/lib/hooks/useRPASocket';

interface RPASocketContextType {
  isConnected: boolean;
  socketId: string | null;
}

const RPASocketContext = createContext<RPASocketContextType>({
  isConnected: false,
  socketId: null,
});

export function RPASocketProvider({ children }: { children: ReactNode }) {
  const socket = useRPASocket({ autoConnect: true });

  return (
    <RPASocketContext.Provider
      value={{ isConnected: socket.isConnected, socketId: socket.socketId }}
    >
      {children}
    </RPASocketContext.Provider>
  );
}

export function useRPASocketContext() {
  return useContext(RPASocketContext);
}
```

```tsx
// app/layout.tsx
import { RPASocketProvider } from '@/providers/RPASocketProvider';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <RPASocketProvider>{children}</RPASocketProvider>
      </body>
    </html>
  );
}
```

---

## Tipos TypeScript

```typescript
// types/rpa-socket.ts
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed?: number;
}

export interface TaskEvent {
  taskId: string;
  type?: string;
  status?: string;
  userId?: string;
  progress?: number;
  message?: string;
  error?: string;
  result?: Record<string, unknown>;
  duration?: number;
  attempts?: number;
  willRetry?: boolean;
  timestamp: string;
}

export interface PlanillaEvent {
  planillaId: string;
  numeroPlanilla: string;
  estadoPago: string;
  hasComprobante?: boolean;
  userId?: string;
  timestamp: string;
}

export interface ComprobanteEvent {
  planillaId: string;
  numeroPlanilla: string;
  fileUrl: string;
  userId: string;
  timestamp: string;
}

export interface LogEvent {
  taskId: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface MetricsBroadcast {
  queue: QueueStats;
  connectedClients: number;
  timestamp: string;
}
```

---

## Testing del Cliente

### Verificar Conexión

```typescript
// test-connection.ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  path: '/socket.io/',
  auth: { apiKey: process.env.RPA_API_KEY },
});

socket.on('connect', () => {
  console.log('Connected!', socket.id);
});

socket.on('connected', (data) => {
  console.log('Server confirmed:', data);
});

socket.on('connect_error', (err) => {
  console.error('Connection failed:', err.message);
});

// Listen for events
socket.on('task:updated', (event) => {
  console.log('Task updated:', event);
});

socket.on('queue:updated', (stats) => {
  console.log('Queue stats:', stats);
});

// Request stats
socket.emit('request:stats');
```

---

## Notas de Seguridad

1. **API Key**: La API key se envía en el handshake de autenticación. Asegurarse de que `RPA_API_KEY` esté en el servidor de Next.js, no expuesta al cliente.

2. **Server-Side**: Para páginas que requieren autenticación, considerar hacer la conexión WebSocket desde un API route de Next.js o usar Server Actions.

3. **Reconexión**: El cliente maneja reconexión automática con backoff exponencial.

---

**Última actualización:** 2026-02-08
**Autor:** Claude Code
**Versión:** 1.0.0
