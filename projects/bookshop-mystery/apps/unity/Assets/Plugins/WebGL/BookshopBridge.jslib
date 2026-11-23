mergeInto(LibraryManager.library, {
  BookshopStageReady: function () {
    window.dispatchEvent(new Event('bookshop-unity-ready'));
  },
});
