MediConnect — Healthcare Appointment Platform
MediConnect is a MERN stack healthcare web application designed to help users explore doctor profiles and, as the project develops, manage doctor appointments online.
Project status: In development. Features described as planned below should not be considered complete until implemented and tested.

Overview
The goal of MediConnect is to provide a simple, user-friendly place where patients can discover doctors and access healthcare appointment services.
Technology Stack
- Frontend: React, Vite, CSS
- Backend: Node.js, Express.js
- Database: MongoDB with Mongoose
- Authentication: JSON Web Tokens (JWT) and bcrypt password hashing
Current Project Features
- React-based web interface
- Express backend API
- MongoDB connection
- Doctor data model and doctor API endpoints
- User registration and login API
- Password hashing and JWT-based authentication (when configured and tested)
Planned Features
- Search and filter doctors by specialty, fees, and experience
- Doctor profile pages
- Appointment booking with available time slots
- Patient dashboard and appointment history
- Doctor and admin dashboards with role-based access
- Appointment cancellation and rescheduling
- Email reminders and notifications
- AI-powered health information assistant with appropriate safety guidance
- Responsive design and deployment
Project Structure
mediconnect/
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── AuthModal.jsx
│       └── index.css
└── backend/
    ├── models/
    │   └── Doctor.js
    ├── routes/
    │   └── auth.js
    ├── server.js
    ├── seed.js
    ├── package.json
    └── .env
Your actual files may differ as development continues.
Prerequisites
- Node.js and npm
- MongoDB connection (local MongoDB or MongoDB Atlas)
- Git (optional, for version control)
Setup and Run Locally
1. Get the project
If the project is on GitHub, clone it and enter the project directory:
git clone YOUR_REPOSITORY_URL
cd mediconnect
If you already have the project on your computer, open a terminal in the existing project folder instead.
2. Configure the backend
cd backend
npm install
Create a .env file inside backend/:
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
Security: Never commit .env to GitHub or share database credentials or JWT secrets. Ensure .env is listed in .gitignore.

Start the backend:
node server.js
If your package.json has a configured development script, you can use npm run dev instead.

The API should be available at http://localhost:5000.
3. Configure the frontend
Open a second terminal:
cd frontend
npm install
npm run dev
Open the local URL shown by Vite, commonly http://localhost:5173.
API Endpoints
These endpoints are part of the current backend design; test them in your running application to confirm their behavior.
Method	Endpoint	Purpose
GET	/	API welcome message
GET	/api/health	Backend health check
GET	/api/doctors	Retrieve doctors
GET	/api/doctors/:id	Retrieve one doctor
POST	/api/doctors	Create a doctor record
POST	/api/auth/register	Register a user
POST	/api/auth/login	Log in a user


Example health check
Open http://localhost:5000/api/health in your browser. If the backend is running, it should return a JSON response indicating the API is running.
How to Use
1. Start the backend and frontend.
2. Open the frontend in your browser.
3. Register an account, then log in.
4. Explore the doctor list if it is available in the current UI.
5. Appointment booking and dashboards will be usable once those features have been implemented and tested.
Security and Privacy Notes
- Hash passwords before storing them; never store plain-text passwords.
- Validate input on the server.
- Protect private APIs with authentication and authorization middleware.
- Enforce role-based permissions on the server, not only in the frontend.
- Prevent double-booking with server-side checks and appropriate database constraints.
- Do not store real patient medical records until appropriate security, consent, access controls, backups, and applicable legal requirements have been addressed.
- An AI health assistant should provide general information, not a definitive diagnosis, and should direct emergency symptoms to urgent professional care.
Future Improvements
- Appointment availability and booking workflow
- Patient, doctor, and admin dashboards
- Email notifications
- Doctor reviews and favorites
- Video consultations
- Secure prescriptions and medical record storage
- Automated tests, monitoring, deployment, and backups
Contributing
This project is under development. For changes, create a separate branch, test your changes, and submit a pull request.
Disclaimer
MediConnect is a software project in development and is not a substitute for professional medical advice, diagnosis, or treatment.