<%
' GhostLink Demo — Classic ASP Login Page (VBScript)
' Intentionally legacy code for demonstration purposes.
' Contains SQL injection vulnerability — intentional demo only.

Option Explicit

Dim conn, rs, sql
Dim username, password, errorMsg

errorMsg = ""

Sub OpenDatabase()
    Set conn = Server.CreateObject("ADODB.Connection")
    conn.Open "Provider=SQLOLEDB;Data Source=localhost;Initial Catalog=UsersDB;User ID=sa;Password=password;"
End Sub

Sub CloseDatabase()
    If Not IsNull(conn) Then
        conn.Close
        Set conn = Nothing
    End If
End Sub

Function ValidateUser(uname, pwd)
    Dim result
    result = False
    Call OpenDatabase()
    ' SQL injection vulnerability — intentional demo
    sql = "SELECT * FROM users WHERE username = '" & uname & "' AND password = '" & pwd & "'"
    Set rs = conn.Execute(sql)
    If Not rs.EOF Then
        result = True
        Session("user_id")   = rs("id")
        Session("username")  = rs("username")
        Session("role")      = rs("role")
        Session("logged_in") = True
    End If
    rs.Close
    Set rs = Nothing
    Call CloseDatabase()
    ValidateUser = result
End Function

Function IsLoggedIn()
    IsLoggedIn = (Session("logged_in") = True)
End Function

Sub LogoutUser()
    Session.Abandon()
End Sub

Sub LogLoginAttempt(uname, success)
    Call OpenDatabase()
    Dim logSql
    logSql = "INSERT INTO login_log (username, success, attempt_time, ip_address) " & _
             "VALUES ('" & uname & "', " & CInt(success) & ", GETDATE(), '" & Request.ServerVariables("REMOTE_ADDR") & "')"
    conn.Execute(logSql)
    Call CloseDatabase()
End Sub

' Handle form submission
If Request.ServerVariables("REQUEST_METHOD") = "POST" Then
    username = Request.Form("username")
    password = Request.Form("password")
    If Len(Trim(username)) = 0 Or Len(Trim(password)) = 0 Then
        errorMsg = "Username and password are required."
    ElseIf ValidateUser(username, password) Then
        Call LogLoginAttempt(username, True)
        Response.Redirect("dashboard.asp")
    Else
        Call LogLoginAttempt(username, False)
        errorMsg = "Invalid username or password."
    End If
End If
%>
<html>
<head><title>Login</title></head>
<body>
<h2>Login</h2>
<% If errorMsg <> "" Then %>
  <p style="color:red"><%= errorMsg %></p>
<% End If %>
<form method="POST" action="login.asp">
  <label>Username: <input type="text" name="username"></label><br>
  <label>Password: <input type="password" name="password"></label><br>
  <input type="submit" value="Login">
</form>
</body>
</html>
