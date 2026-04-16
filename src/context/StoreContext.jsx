import React, { createContext, useContext, useReducer } from 'react';
import { initialSchedule, teachers, classes, subjects, initialAbsences, initialSubstitutions, schoolConfig } from '../data/mockData';

const StoreContext = createContext();

const initialState = {
  schedule: initialSchedule,
  teachers,
  classes,
  subjects,
  absences: initialAbsences,
  substitutions: initialSubstitutions,
  config: schoolConfig
};

function storeReducer(state, action) {
  switch (action.type) {
    case 'MARK_ABSENT': {
      return {
        ...state,
        absences: [...state.absences, action.payload]
      };
    }
    case 'ASSIGN_SUBSTITUTE': {
      // Find and replace or add substitution
      const existingFilter = state.substitutions.filter(s => 
        !(s.date === action.payload.date && s.scheduleId === action.payload.scheduleId)
      );
      return {
        ...state,
        substitutions: [...existingFilter, action.payload]
      };
    }
    case 'UPDATE_SCHEDULE': {
      const { scheduleId, teacherId, subjectId } = action.payload;
      const updatedSchedule = state.schedule.map(sch => 
        sch.id === scheduleId ? { ...sch, teacherId, subjectId } : sch
      );
      return { ...state, schedule: updatedSchedule };
    }
    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(storeReducer, initialState);
  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
