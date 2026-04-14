import './App.css';
import { ChatContext } from './Context/ChatContext';
import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainPanel from './Pages/MainPanel/MainPanel';
import Login from './Pages/Login/Login';
import Room from './Pages/Rooms/Rooms';

function App() {
  const api = process.env.REACT_APP_SOCKET_API || 'http://localhost:4000';
  const [store, setStore] = useState();

  return (
    <div className="mainApp">
      <ChatContext.Provider value={{ api, store, updateStore: setStore }}>
        <Router>
          <Routes>
            <Route path="/"                   element={<Login />} />
            <Route path="/mainpanel"          element={<MainPanel />} />
            {/* :roomName in the URL — opening /rooms/gaming auto-joins "gaming" */}
            <Route path="/rooms/:roomName"    element={<Room />} />
            <Route path="/rooms"              element={<Room />} />
          </Routes>
        </Router>
      </ChatContext.Provider>
    </div>
  );
}

export default App;
