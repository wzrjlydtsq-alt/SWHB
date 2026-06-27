export const createLibrarySlice = (set) => ({
  characterLibrary: [],
  setCharacterLibrary: (characterLibraryOrFn) => {
    if (typeof characterLibraryOrFn === 'function') {
      set((state) => ({ characterLibrary: characterLibraryOrFn(state.characterLibrary) }))
    } else {
      set({ characterLibrary: characterLibraryOrFn })
    }
  },

  promptLibrary: [],
  setPromptLibrary: (libraryOrFn) => {
    if (typeof libraryOrFn === 'function') {
      set((state) => ({ promptLibrary: libraryOrFn(state.promptLibrary) }))
    } else {
      set({ promptLibrary: libraryOrFn })
    }
  },

  promptLibraryForm: { name: '', prompt: '' },
  setPromptLibraryForm: (formOrFn) => {
    if (typeof formOrFn === 'function') {
      set((state) => ({ promptLibraryForm: formOrFn(state.promptLibraryForm) }))
    } else {
      set({ promptLibraryForm: formOrFn })
    }
  },

  promptLibraryCollapsed: true,
  setPromptLibraryCollapsed: (collapsedOrFn) => {
    if (typeof collapsedOrFn === 'function') {
      set((state) => ({ promptLibraryCollapsed: collapsedOrFn(state.promptLibraryCollapsed) }))
    } else {
      set({ promptLibraryCollapsed: collapsedOrFn })
    }
  },

  promptLibraryEditorOpen: false,
  setPromptLibraryEditorOpen: (openOrFn) => {
    if (typeof openOrFn === 'function') {
      set((state) => ({ promptLibraryEditorOpen: openOrFn(state.promptLibraryEditorOpen) }))
    } else {
      set({ promptLibraryEditorOpen: openOrFn })
    }
  }
})
