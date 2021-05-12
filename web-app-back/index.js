const express = require("express");
const app = express();
const cors = require("cors");
const pool = require('./db');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv')
const bcryptjs = require('bcryptjs')
const verify = require('./verifyToken')
dotenv.config();

app.use(cors());
app.use(express.json());


app.get("/university", async (req, res) => {
  try {
    const allTodos = await pool.query('SELECT * FROM university');
    res.json(allTodos.rows)
  } catch (error) {
    console.log(error.message)
  }
});

app.post('/study', async (req, res) => {
  try {
    const {
      id,
      table,
      f_key
    } = req.body;
    const idTodo = await pool.query(`SELECT * FROM ${table} WHERE ${f_key} = ${id}`);
    res.json(idTodo.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/register', async (req, res) => {
  try {
    const {
      userLogin,
      userPassword,
      userFirstName,
      userSecondName,
      userMiddleName,
      userGroup,
      userRole
    } = req.body;
    const salt = await bcryptjs.genSalt(10)
    const hashedPassword = await bcryptjs.hash(userPassword, salt)
    const user = await pool.query('INSERT INTO users (user_login, user_password, user_first_name, user_second_name, user_middle_name) VALUES ($1,$2,$3,$4,$5) RETURNING user_id', [userLogin, hashedPassword, userFirstName, userSecondName, userMiddleName]);
    const roleId = await pool.query('SELECT * FROM roles WHERE role_name = $1  ', [userRole]);
    await pool.query('INSERT INTO users_roles VALUES ($1,$2)', [user.rows[0].user_id, roleId.rows[0].role_id]);
    if(userRole === 'student'){
      await pool.query('INSERT INTO students (user_id,group_id) VALUES ($1,$2)', [user.rows[0].user_id, userGroup]);
    }
    const token = jwt.sign({
      id: user.rows[0].user_id
    }, process.env.TOKEN_SECRET)
    res.json({
      token: token
    });
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/log-in', async (req, res) => {
  try {
    const {
      userLogin,
      userPassword
    } = req.body;
    const user = await pool.query('SELECT * FROM users WHERE user_login = $1', [userLogin]);
    if (user.rows[0]) {
      bcryptjs.compare(userPassword, user.rows[0].user_password, async(err, isMatch) => {
        if (isMatch) {
          const token = jwt.sign({ id: user.rows[0].user_id }, process.env.TOKEN_SECRET)
          const userRoleId = await pool.query('SELECT role_id FROM users_roles WHERE user_id = $1 ', [user.rows[0].user_id]);
          const roleName = await pool.query('SELECT role_name FROM roles WHERE role_id = $1 ', [userRoleId.rows[0].role_id]);
          res.json({
            token: token,
            role:roleName.rows[0].role_name
          });
        } else {
          res.status(400).json({
            error: "Invalid password"
          })
        }
      });
    } else {
      res.status(400).json({
        error: "Invalid login"
      })
    }

  } catch (error) {
    console.log(error.message)
  }
})


app.get('/user-data', verify, async (req, res) => {
  const user = await pool.query('SELECT * FROM users WHERE user_id = $1 ', [req.user.id]);
  const userRoleId = await pool.query('SELECT role_id FROM users_roles WHERE user_id = $1 ', [req.user.id]);
  const roleName = await pool.query('SELECT role_name FROM roles WHERE role_id = $1 ', [userRoleId.rows[0].role_id]);
  user.rows[0].role = roleName.rows[0].role_name;
  res.json(user.rows[0])
})


app.get('/users', verify, async (req, res) => {
  const users = await pool.query(`SELECT user_id, user_first_name, user_second_name, user_middle_name, user_confirm, role_name FROM users NATURAL INNER JOIN users_roles NATURAL INNER JOIN roles WHERE user_login != 'admin' `);
  res.json(users.rows)
})

app.put('/user/role', verify, async(req,res) => {
  try {
    const { id, newUserRole }  = req.body;
    const roleId = await pool.query('SELECT role_id FROM roles WHERE role_name = $1  ', [newUserRole]);
    await pool.query('UPDATE users_roles SET role_id = $2 WHERE user_id = $1',[id , roleId.rows[0].role_id]);
    res.json(roleId.rows[0].role_id)
  } catch (error) {
    console.log(error.message)
  }
})


app.put('/user/:id', verify, async(req,res) => {
  try {
    const { id }  = req.params;
    await pool.query('UPDATE users SET user_confirm = true WHERE user_id = $1',[id]);
    res.json('user was update')
  } catch (error) {
    console.log(error.message)
  }
})

app.delete('/user/:id', verify, async(req, res) => {
  try {
    const { id }  = req.params;
    await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
    const role = await pool.query('DELETE FROM users_roles WHERE user_id = $1 RETURNING role_id', [id]);

    if(role.rows[0].role_id == 1){
      await pool.query('DELETE FROM students WHERE user_id = $1', [id]);
    }
    
    res.json('user was deleted')
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/fuzzyset', verify, async (req, res) => {
  try {
    const courseWorks = await pool.query('SELECT name FROM diplom_work')
    res.json(courseWorks.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/users/:role',verify, async (req, res) => {
  try {
    const { role }  = req.params;
    const users = await pool.query(`SELECT user_id, user_first_name, user_second_name, user_middle_name FROM users NATURAL INNER JOIN users_roles NATURAL INNER JOIN roles WHERE role_name = $1 AND user_confirm = true `,[role]);
    res.json(users.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/users/work', verify, async (req, res) => {
  try {
    const {
      studentWorkName,
      studentWorkLector,
      userId
    } = req.body;
    const courseWorks = await pool.query('INSERT INTO diplom_work (name,id_student,id_leader) VALUES ($1,$2,$3) RETURNING id_diplom_work', [studentWorkName,userId,studentWorkLector])
    res.json(courseWorks.rows[0])
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/user/work/:id', verify, async (req, res) => {
  try {
    const { id }  = req.params;
    const courseWorks = await pool.query('SELECT * FROM diplom_work WHERE id_student = $1',[id])
    if(courseWorks.rows[0]){
      const lector =  await pool.query('SELECT user_first_name, user_second_name, user_middle_name FROM users WHERE user_id = $1',[courseWorks.rows[0].id_leader])
      courseWorks.rows[0].lector = lector.rows[0]
    }
    res.json(courseWorks.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/users/students', verify, async (req, res) => {
  try {
    console.log('work')
    const students = await pool.query('SELECT users.user_first_name, users.user_second_name, users.user_middle_name, diplom_work.id_diplom_work, diplom_work.name,diplom_work.id_leader FROM users INNER JOIN diplom_work ON users.user_id = cast(diplom_work.id_student as int8) ;')
    console.log(students.rows)
    res.json(students)
  } catch (error) {
    console.log(error.message)
  }
})


app.put('/users/work', verify, async (req, res) => {
  try {
    const {
      studentWorkName,
      studentWorkLector,
      userId
    } = req.body;
    await pool.query('UPDATE diplom_work SET name = $1, id_leader = $2 WHERE id_student = $3',[studentWorkName,studentWorkLector,userId])
    res.json('user was update')
  } catch (error) {
    console.log(error.message)
  }
})


app.post('/date', verify, async (req, res) => {
  try {
    const {yearStart,yearEnd} = req.body;
   await pool.query('INSERT INTO years_of_study (year_start,year_end) VALUES ($1,$2)', [yearStart,yearEnd])
  
    res.json('date was posted')
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/date', verify, async (req, res) => {
  try {
    const dates = await pool.query('SELECT * FROM years_of_study')
    res.json(dates.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.delete('/date/:id', verify, async(req, res) => {
  try {
    const { id }  = req.params;
    await pool.query('DELETE FROM years_of_study WHERE year_id = $1', [id]);
    res.json('date was deleted')
  } catch (error) {
    console.log(error.message)
  }
})


app.post('/sec', verify, async (req, res) => {
  try {
    const {number,start,end,year} = req.body;
    await pool.query('INSERT INTO sec (sec_number,sec_start_date,sec_end_date,year_id) VALUES ($1,$2,$3,$4) RETURNING sec_id', [number,start,end,year])
    res.json('date was posted')
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec', verify, async (req, res) => {
  try {
    const sec = await pool.query('SELECT * FROM sec')
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.delete('/sec/:id', verify, async (req, res) => {
  try {
    const id = req.params.id
    await pool.query('DELETE FROM sec WHERE sec_id = $1',[id])
    res.json('sec was delete')
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec/:id', verify, async (req, res) => {
  try {
    const id = req.params.id
    const sec = await pool.query('SELECT * FROM sec NATURAL INNER JOIN years_of_study WHERE sec_id = $1',[id])
    res.json(sec.rows[0])
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-cathedra', verify, async (req, res) => {
  try {
    const sec = await pool.query('SELECT * FROM cathedra NATURAL INNER JOIN faculty WHERE fk_faculty = faculty_id')
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-cathedra', verify, async (req, res) => {
  try {
    const {cathedraId,secId} = req.body;
    const sec = await pool.query('UPDATE sec SET fk_cathedra = $1 WHERE sec_id = $2 ',[cathedraId,secId])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-cathedra/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query('SELECT * FROM cathedra NATURAL INNER JOIN faculty NATURAL INNER JOIN sec WHERE fk_cathedra = cathedra_id AND sec_id = $1',[id])
    
    res.json(sec.rows[0])
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-cathedra/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query('UPDATE sec SET fk_cathedra = $1 WHERE sec_id = $2',[null,id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-specialty-cathedra/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(id)
    const sec = await pool.query('SELECT * FROM specialty NATURAL INNER JOIN cathedra WHERE fk_cathedra = cathedra_id AND cathedra_id = $1',[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/sec-specialty', verify, async (req, res) => {
  try {
    const {specialtyId,secId} = req.body;
    const sec = await pool.query('INSERT INTO sec_specialty (specialty_id, sec_id) VALUES ($1,$2) ',[specialtyId,secId])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-specialty/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query('SELECT * FROM sec_specialty NATURAL INNER JOIN specialty WHERE sec_id = $1 ',[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-specialty', verify, async (req, res) => {
  try {
    const {secId,id} = req.body;
    const sec = await pool.query('DELETE FROM sec_specialty WHERE sec_id = $1 AND specialty_id = $2',[secId,id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-groups/:id', verify, async (req, res) => {
  try {
    const id = req.params.id
    const sec = await pool.query('SELECT * FROM groups NATURAL INNER JOIN specialty WHERE fk_specialty = specialty_id AND specialty_id = $1',[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/sec-group', verify, async (req, res) => {
  try {
    const {groupId,secId} = req.body;
    const sec = await pool.query('INSERT INTO sec_group (sec_id, group_id) VALUES ($2,$1)',[groupId,secId])
    const students = await pool.query(`SELECT * FROM students WHERE group_id = $1`,[groupId])
    console.log(students.rows[0])
    // for await (let student of students.rows){
    //   await pool.query('INSERT INTO students_marks (student_id,group_id) VALUES ($1,$2)',[student.user_id, groupId])
    // }
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-group/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query(`SELECT * FROM specialty INNER JOIN groups ON specialty.specialty_id = groups.group_id INNER JOIN sec_group ON sec_group.group_id = groups.group_id WHERE sec_group.sec_id = $1`,[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-group/', verify, async (req, res) => {
  try {
    const {secId,groupId} = req.body;
    await pool.query(`DELETE FROM sec_group WHERE sec_id = $1 AND group_id = $2`,[secId,groupId]);
    await pool.query('DELETE FROM students_marks WHERE group_id = $1',[groupId])
    res.json('group was deleted')
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/sec-percent', verify, async (req, res) => {
  try {
    const {name,percentPlane,comment, fromDate, toDate, secId,students} = req.body;
    const percentage = await pool.query('INSERT INTO percentage (comment,name,start_date,end_date,sec_id,plan_percent) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_percentage',[comment,name,fromDate,toDate,secId,percentPlane,])
    for await(let student of students){
      console.log(student)
      await pool.query('INSERT INTO students_marks (percent_id,student_id) values ($1,$2)',[percentage.rows[0].id_percentage, student])
    }
    res.json(percentage.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-percent/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query(`SELECT * FROM percentage  WHERE sec_id = $1`,[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.delete('/sec-percent/:id', verify, async (req, res) => {
  try {
    const id = req.params.id
    await pool.query('DELETE FROM percentage WHERE id_percentage = $1',[id])
    await pool.query('DELETE FROM students_marks WHERE percent_id = $1',[id])
    res.json('sec was delete')
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-percent', verify, async (req, res) => {
  try {
    const {name,percentPlane,comment, fromDate, toDate, percentId,students} = req.body;
    const sec = await pool.query('UPDATE percentage SET comment = $1, name = $2, start_date = $3, end_date = $4, plan_percent = $5  WHERE id_percentage = $6 ',[comment,name,fromDate,toDate,percentPlane,percentId,])
    await pool.query('DELETE FROM students_marks WHERE percent_id = $1',[percentId])
    for await(let student of students){
      console.log(student)
      await pool.query('INSERT INTO students_marks (percent_id,student_id) values ($1,$2)',[percentId, student])
    }
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/sec-event', verify, async (req, res) => {
  try {
    const {address,selectedGroup,model,time, secId, students} = req.body;
    const sec = await pool.query('INSERT INTO sec_event (address,date,end_date,sec_id,group_id) VALUES ($1,$2,$3,$4,$5) RETURNING id_sec_event',[address,model,time,secId,selectedGroup])
    for await(let student of students){
      console.log(student)
      await pool.query('INSERT INTO students_marks (sec_event_id,student_id) values ($1,$2)',[sec.rows[0].id_sec_event, student])
    }
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-event/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query(`SELECT * FROM sec_event WHERE sec_id = $1`,[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.delete('/sec-event/:id', verify, async (req, res) => {
  try {
    const id = req.params.id
    await pool.query('DELETE FROM sec_event WHERE id_sec_event = $1',[id]);
    await pool.query('DELETE FROM students_marks WHERE sec_event_id = $1',[id])
    res.json('sec was delete')
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-event', verify, async (req, res) => {
  try {
    const {address,selectedGroup,model,time, eventId,students} = req.body;
    console.log(eventId)
    const sec = await pool.query('UPDATE sec_event SET address = $1, date = $2, end_date = $3, group_id = $4 WHERE id_sec_event = $5',[address,model,time,selectedGroup,eventId])
    await pool.query('DELETE FROM students_marks WHERE sec_event_id = $1',[eventId]);
    for await(let student of students){
      console.log(student)
      await pool.query('INSERT INTO students_marks (sec_event_id,student_id) values ($1,$2)',[eventId, student])
    }
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-roles', verify, async (req, res) => {
  try {
    const sec = await pool.query(`SELECT * FROM sec_role`)
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.post('/sec-user', verify, async (req, res) => {
  try {
    const {firstName, lastName, middleName, roleId , secId} = req.body;
    const sec = await pool.query('INSERT INTO sec_user (firstname, lastname, middlename, id_sec_role,id_sec) VALUES ($1,$2,$3,$4,$5)',[firstName, lastName, middleName, roleId , secId])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-users/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query(`SELECT * FROM sec_user INNER JOIN sec_role ON sec_user.id_sec_role = sec_role.id_sec_role WHERE sec_user.id_sec = $1`,[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.delete('/sec-user/:id', verify, async (req, res) => {
  try {
    const id = req.params.id
    await pool.query('DELETE FROM sec_user WHERE id_sec_user = $1',[id])
    res.json('sec was delete')
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-user', verify, async (req, res) => {
  try {
    const {firstName, lastName, middleName, roleId , userId} = req.body;
    console.log(req.body)
    const sec = await pool.query('UPDATE sec_user SET firstname = $1, lastname = $2, middlename = $3, id_sec_role = $4 WHERE id_sec_user = $5',[firstName, lastName, middleName, roleId , userId])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-users-percents/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    const sec = await pool.query(`SELECT * FROM sec_user INNER JOIN sec_role ON sec_user.id_sec_role = sec_role.id_sec_role WHERE sec_user.id_sec = $1`,[id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})


app.get('/sec-students/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(id)
    const students = await pool.query(`SELECT * FROM students INNER JOIN users ON users.user_id = students.user_id WHERE students.group_id = $1`,[id])
    res.json(students.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-students-percent/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(id)
    const students = await pool.query(`SELECT * FROM students INNER JOIN users ON users.user_id = students.user_id INNER JOIN students_marks ON students.user_id = students_marks.student_id  WHERE students_marks.percent_id = $1`,[id])
    res.json(students.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.get('/sec-students-event/:id', verify, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(id)
    const students = await pool.query(`SELECT * FROM students INNER JOIN users ON users.user_id = students.user_id INNER JOIN students_marks ON students.user_id = students_marks.student_id  WHERE students_marks.sec_event_id = $1`,[id])
    res.json(students.rows)
  } catch (error) {
    console.log(error.message)
  }
})


app.put('/sec-students-percent-mark', verify, async (req, res) => {
  try {
    const {value, user} = req.body;
    console.log(value, user)
    console.log(req.body)
    const sec = await pool.query('UPDATE students_marks SET percent_mark = $1 WHERE student_id = $2',[value, user.student_id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.put('/sec-students-event-mark', verify, async (req, res) => {
  try {
    const {value, user} = req.body;
    console.log(value, user)
    console.log(req.body)
    const sec = await pool.query('UPDATE students_marks SET sec_event_mark = $1 WHERE student_id = $2',[value, user.student_id])
    res.json(sec.rows)
  } catch (error) {
    console.log(error.message)
  }
})

app.listen(5000, () => {
  console.log("server has start at port 5000")
})
