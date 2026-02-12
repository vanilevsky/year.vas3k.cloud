import "./App.css"
import AuthButton from "./components/AuthButton"
import Calendar from "./components/Calendar"
import { AuthProvider } from "./contexts/AuthContext"
import { CalendarProvider } from "./contexts/CalendarContext"

function App() {
  return (
    <AuthProvider>
      <CalendarProvider>
        <div className="App">
          <AuthButton />
          <Calendar />
        </div>
      </CalendarProvider>
    </AuthProvider>
  )
}

export default App
