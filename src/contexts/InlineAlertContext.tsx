import React, { createContext, useContext, Dispatch, SetStateAction } from 'react';

export type InlineAlertType = { emailId: string; message: string } | null;

interface InlineAlertContextType {
  inlineAlert: InlineAlertType;
  setInlineAlert: Dispatch<SetStateAction<InlineAlertType>>;
  isVisibleForEmail: (emailId?: string) => boolean;
}

const InlineAlertContext = createContext<InlineAlertContextType | undefined>(undefined);

export const useInlineAlert = () => {
  const ctx = useContext(InlineAlertContext);
  if (!ctx) throw new Error('useInlineAlert must be used within InlineAlertContext.Provider');
  return ctx;
};

export default InlineAlertContext;
