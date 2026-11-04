Attribute VB_Name = "Calculator"
' GhostLink Demo — VB6 Calculator Module
' Intentionally legacy VB6 style for demonstration purposes.

Option Explicit

' Global state variables
Public g_lastResult As Double
Public g_operand1 As Double
Public g_operand2 As Double
Public g_currentOp As String
Public g_hasError As Boolean

' Form Load event
Private Sub Form_Load()
    g_lastResult = 0
    g_operand1 = 0
    g_operand2 = 0
    g_currentOp = ""
    g_hasError = False
    txtDisplay.Text = "0"
    lblStatus.Caption = "Ready"
End Sub

' Calculate button click handler
Private Sub btnCalculate_Click()
    Dim result As Double
    Dim op1 As Double
    Dim op2 As Double
    
    If g_hasError Then
        MsgBox "Please clear the error first.", vbExclamation, "Calculator Error"
        Exit Sub
    End If
    
    op1 = CDbl(txtOperand1.Text)
    op2 = CDbl(txtOperand2.Text)
    
    Select Case cmbOperation.Text
        Case "+"
            result = Add(op1, op2)
        Case "-"
            result = Subtract(op1, op2)
        Case "*"
            result = Multiply(op1, op2)
        Case "/"
            result = Divide(op1, op2)
        Case Else
            MsgBox "Please select an operation.", vbExclamation, "No Operation"
            Exit Sub
    End Select
    
    If Not g_hasError Then
        g_lastResult = result
        txtDisplay.Text = CStr(result)
        lblStatus.Caption = "Result: " & CStr(result)
    End If
End Sub

' Clear button click handler
Private Sub btnClear_Click()
    txtOperand1.Text = "0"
    txtOperand2.Text = "0"
    txtDisplay.Text = "0"
    cmbOperation.Text = ""
    g_hasError = False
    g_lastResult = 0
    lblStatus.Caption = "Cleared"
End Sub

' Arithmetic functions
Public Function Add(a As Double, b As Double) As Double
    Add = a + b
End Function

Public Function Subtract(a As Double, b As Double) As Double
    Subtract = a - b
End Function

Public Function Multiply(a As Double, b As Double) As Double
    Multiply = a * b
End Function

Public Function Divide(a As Double, b As Double) As Double
    If b = 0 Then
        g_hasError = True
        lblStatus.Caption = "Error: Division by zero"
        MsgBox "Cannot divide by zero.", vbCritical, "Math Error"
        Divide = 0
    Else
        Divide = a / b
    End If
End Function
