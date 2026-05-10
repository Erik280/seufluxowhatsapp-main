import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import './KanbanView.css';

// Mock Data
const initialColumns = {
  'col-1': { id: 'col-1', title: 'Novos Leads', color: '#00E5CC', taskIds: ['task-1', 'task-2'] },
  'col-2': { id: 'col-2', title: 'Em Atendimento', color: '#00FF88', taskIds: ['task-3'] },
  'col-3': { id: 'col-3', title: 'Fechado', color: '#8892b0', taskIds: [] },
};

const initialTasks = {
  'task-1': { id: 'task-1', name: 'João Silva', phone: '+55 11 99999-9999', lastMessage: 'Olá, gostaria de saber mais.', time: '10:42' },
  'task-2': { id: 'task-2', name: 'Maria Souza', phone: '+55 21 98888-8888', lastMessage: 'Qual o valor?', time: '09:15' },
  'task-3': { id: 'task-3', name: 'Carlos Tech', phone: '+55 31 97777-7777', lastMessage: 'Entendido, obrigado.', time: 'Ontem' },
};

export default function KanbanView() {
  const [columns, setColumns] = useState(initialColumns);
  const [tasks] = useState(initialTasks);

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceCol = columns[source.droppableId as keyof typeof columns];
    const destCol = columns[destination.droppableId as keyof typeof columns];

    if (sourceCol === destCol) {
      const newTaskIds = Array.from(sourceCol.taskIds);
      newTaskIds.splice(source.index, 1);
      newTaskIds.splice(destination.index, 0, draggableId);

      setColumns({
        ...columns,
        [sourceCol.id]: { ...sourceCol, taskIds: newTaskIds }
      });
      return;
    }

    // Moving between columns
    const startTaskIds = Array.from(sourceCol.taskIds);
    startTaskIds.splice(source.index, 1);

    const finishTaskIds = Array.from(destCol.taskIds);
    finishTaskIds.splice(destination.index, 0, draggableId);

    setColumns({
      ...columns,
      [sourceCol.id]: { ...sourceCol, taskIds: startTaskIds },
      [destCol.id]: { ...destCol, taskIds: finishTaskIds },
    });

    // TODO: Call API to update contact stage
    console.log(`Moved ${draggableId} to ${destCol.id}`);
  };

  return (
    <div className="kanban-view-root">
      <header className="kanban-header">
        <h2>Gestão de Funil</h2>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-board">
          {Object.values(columns).map(column => (
            <div key={column.id} className="kanban-column">
              <div className="column-header" style={{ borderTopColor: column.color }}>
                <h3>{column.title}</h3>
                <span className="task-count">{column.taskIds.length}</span>
              </div>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    className={`task-list ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {column.taskIds.map((taskId, index) => {
                      const task = tasks[taskId as keyof typeof tasks];
                      return (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              className={`task-card ${snapshot.isDragging ? 'dragging' : ''}`}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <div className="task-name">{task.name}</div>
                              <div className="task-msg">{task.lastMessage}</div>
                              <div className="task-footer">
                                <span className="task-time">{task.time}</span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
