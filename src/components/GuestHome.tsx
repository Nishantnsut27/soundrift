import { usePlayerStore } from '../store/playerStore';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { RelatedMusic } from './RelatedMusic';
import { ErrorDisplay } from './ErrorDisplay';
import { CuratedSections } from './CuratedSections';

export function GuestHome() {
  const { results, query, isLoading, error } = usePlayerStore();

  const isSearching = query.trim().length > 0 || results.length > 0;

  if (error) {
    return (
      <div className="view-container">
        <div className="content-search-container">
          <SearchBar />
        </div>
        <ErrorDisplay
          title="Music Temporarily Unavailable"
          message={error}
          onRetry={() => window.location.reload()}
          onDismiss={() => usePlayerStore.getState().setError(null)}
        />
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="content-search-container">
        <SearchBar />
      </div>

      {isSearching ? (
        <SearchResults tracks={results} query={query} isLoading={isLoading} />
      ) : (
        <>
          <CuratedSections />
          <RelatedMusic />
        </>
      )}
    </div>
  );
}
