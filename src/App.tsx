import { useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { LoadingScreen } from './components/LoadingScreen';
import { DogProfile } from './pages/DogProfile';
import { FolderView } from './pages/FolderView';
import { NewReport } from './pages/NewReport';
import { RedFlags } from './pages/RedFlags';

function App() {
  const [loading, setLoading] = useState(true);

  if (loading) {
    return <LoadingScreen onFinish={() => setLoading(false)} />;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <Link to="/" className="font-semibold">
          🐕 Abby's Dog Notes
        </Link>
        <Link to="/red-flags" className="text-sm text-red-500 hover:underline">
          🚩 Red Flags
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<FolderView />} />
        <Route path="/folder/:folderId" element={<FolderView />} />
        <Route path="/dog/:dogId" element={<DogProfile />} />
        <Route path="/dog/:dogId/report/new" element={<NewReport />} />
        <Route path="/red-flags" element={<RedFlags />} />
      </Routes>
    </div>
  );
}

export default App;
